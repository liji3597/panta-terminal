//! SQLite persistence: market registry, price snapshots, trade tape.
//! Snapshots are the foundation of the OHLC layer — Panta has no history
//! endpoint, so every price point here is one we captured ourselves.

use panta_client::models::{MarketRow, Trade};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::{Row, SqlitePool};
use std::str::FromStr;

#[derive(Clone)]
pub struct Store {
    pub pool: SqlitePool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candle {
    pub bucket_start: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub ticks: i64,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalletStat {
    pub wallet: String,
    pub trades: i64,
    pub volume_usdc: f64,
    pub markets_touched: i64,
    pub last_active: Option<i64>,
    /// Realized PnL over resolved markets only (avg buy price vs outcome).
    pub realized_pnl: Option<f64>,
    pub wins: i64,
    pub losses: i64,
}

impl Store {
    pub async fn open(url: &str) -> Result<Self, sqlx::Error> {
        let opts = SqliteConnectOptions::from_str(url)?.create_if_missing(true);
        let pool = SqlitePoolOptions::new().max_connections(4).connect_with(opts).await?;
        let s = Self { pool };
        s.migrate().await?;
        Ok(s)
    }

    async fn migrate(&self) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS markets (
                market_id   TEXT PRIMARY KEY,
                category    TEXT,
                title       TEXT,
                status      TEXT,
                phase       TEXT,
                end_time    INTEGER,
                volume_usdc REAL,
                detail_json TEXT,
                first_seen  INTEGER NOT NULL,
                last_seen   INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS snapshots (
                market_id TEXT NOT NULL,
                ts        INTEGER NOT NULL,
                yes_price REAL,
                no_price  REAL,
                volume_usdc REAL,
                PRIMARY KEY (market_id, ts)
            );
            CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(ts);
            CREATE TABLE IF NOT EXISTS trades (
                market_id TEXT,
                wallet    TEXT,
                side      TEXT,
                amount_usdc REAL,
                shares    REAL,
                price     REAL,
                signature TEXT,
                ts        INTEGER,
                UNIQUE(market_id, signature)
            );
            CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet);
            CREATE INDEX IF NOT EXISTS idx_trades_market ON trades(market_id);
            "#,
        )
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn upsert_market(&self, m: &MarketRow, now: i64) -> Result<(), sqlx::Error> {
        let vol = m.volume_usdc.as_deref().and_then(|v| v.parse::<f64>().ok());
        sqlx::query(
            r#"INSERT INTO markets (market_id, category, title, status, phase, end_time, volume_usdc, first_seen, last_seen)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
               ON CONFLICT(market_id) DO UPDATE SET
                 category=excluded.category, status=excluded.status, phase=excluded.phase,
                 end_time=excluded.end_time, volume_usdc=excluded.volume_usdc, last_seen=excluded.last_seen,
                 title=COALESCE(NULLIF(markets.title,''), excluded.title)"#,
        )
        .bind(&m.market_id)
        .bind(m.category.as_deref())
        .bind(m.title.as_deref().filter(|t| !t.is_empty()))
        .bind(m.status.as_deref())
        .bind(m.phase.as_deref())
        .bind(m.end_time)
        .bind(vol)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn cache_detail(&self, market_id: &str, title: Option<&str>, detail: &serde_json::Value, now: i64) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"INSERT INTO markets (market_id, title, detail_json, first_seen, last_seen)
               VALUES (?1, ?2, ?3, ?4, ?4)
               ON CONFLICT(market_id) DO UPDATE SET
                 title=COALESCE(NULLIF(?2,''), markets.title), detail_json=excluded.detail_json, last_seen=excluded.last_seen"#,
        )
        .bind(market_id)
        .bind(title.unwrap_or(""))
        .bind(detail.to_string())
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn cached_detail(&self, market_id: &str) -> Result<Option<serde_json::Value>, sqlx::Error> {
        let row = sqlx::query("SELECT detail_json FROM markets WHERE market_id = ?1 AND detail_json IS NOT NULL")
            .bind(market_id)
            .fetch_optional(&self.pool)
            .await?;
        Ok(row.and_then(|r| r.try_get::<String, _>(0).ok())
            .and_then(|s| serde_json::from_str(&s).ok()))
    }

    pub async fn insert_snapshot(&self, market_id: &str, ts: i64, yes: Option<f64>, no: Option<f64>, vol: Option<f64>) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT OR REPLACE INTO snapshots (market_id, ts, yes_price, no_price, volume_usdc) VALUES (?1,?2,?3,?4,?5)")
            .bind(market_id).bind(ts).bind(yes).bind(no).bind(vol)
            .execute(&self.pool).await?;
        Ok(())
    }

    /// Returns true when the trade was newly inserted (false = already known).
    pub async fn insert_trade(&self, market_id: &str, t: &Trade) -> Result<bool, sqlx::Error> {
        let amt = t.usdc_amount();
        let shares = t.shares.as_deref().and_then(|v| v.parse::<f64>().ok())
            .or_else(|| t.shares_base.as_deref().and_then(|v| v.parse::<f64>().ok()).map(|v| v / 1e6));
        let price = t.implied_price();
        let res = sqlx::query(
            r#"INSERT OR IGNORE INTO trades (market_id, wallet, side, amount_usdc, shares, price, signature, ts)
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8)"#,
        )
        .bind(market_id)
        .bind(t.wallet.as_deref())
        .bind(t.side.as_deref())
        .bind(amt)
        .bind(shares)
        .bind(price)
        .bind(t.signature.as_deref())
        .bind(t.ts())
        .execute(&self.pool)
        .await?;
        Ok(res.rows_affected() > 0)
    }

    /// OHLC over our own snapshots. `bucket_secs`: 60 / 300 / 3600.
    pub async fn candles(&self, market_id: &str, bucket_secs: i64, limit: i64) -> Result<Vec<Candle>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT (ts / ?1) * ?1 AS bucket,
                      MIN(ts) AS first_ts, MAX(ts) AS last_ts,
                      MIN(yes_price) AS lo, MAX(yes_price) AS hi, COUNT(*) AS n
               FROM snapshots WHERE market_id = ?2 AND yes_price IS NOT NULL
               GROUP BY bucket ORDER BY bucket DESC LIMIT ?3"#,
        )
        .bind(bucket_secs).bind(market_id).bind(limit)
        .fetch_all(&self.pool)
        .await?;
        let mut out = Vec::with_capacity(rows.len());
        for r in &rows {
            let bucket: i64 = r.get("bucket");
            let first_ts: i64 = r.get("first_ts");
            let last_ts: i64 = r.get("last_ts");
            let open: Option<f64> = sqlx::query("SELECT yes_price FROM snapshots WHERE market_id=?1 AND ts=?2")
                .bind(market_id).bind(first_ts).fetch_one(&self.pool).await?.try_get(0).ok();
            let close: Option<f64> = sqlx::query("SELECT yes_price FROM snapshots WHERE market_id=?1 AND ts=?2")
                .bind(market_id).bind(last_ts).fetch_one(&self.pool).await?.try_get(0).ok();
            out.push(Candle {
                bucket_start: bucket,
                open: open.unwrap_or(0.0),
                high: r.get::<Option<f64>, _>("hi").unwrap_or(0.0),
                low: r.get::<Option<f64>, _>("lo").unwrap_or(0.0),
                close: close.unwrap_or(0.0),
                ticks: r.get("n"),
            });
        }
        out.reverse();
        Ok(out)
    }

    pub async fn latest_snapshot(&self, market_id: &str) -> Result<Option<(i64, Option<f64>, Option<f64>, Option<f64>)>, sqlx::Error> {
        let row = sqlx::query("SELECT ts, yes_price, no_price, volume_usdc FROM snapshots WHERE market_id=?1 ORDER BY ts DESC LIMIT 1")
            .bind(market_id).fetch_optional(&self.pool).await?;
        Ok(row.map(|r| (r.get(0), r.get(1), r.get(2), r.get(3))))
    }

    /// Radar rows: registry joined with each market's latest snapshot price.
    pub async fn radar_rows(&self) -> Result<Vec<serde_json::Value>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT m.market_id, m.category, m.title, m.status, m.phase, m.end_time,
                      m.volume_usdc, m.first_seen, m.last_seen,
                      s.yes_price, s.no_price, s.ts AS price_ts
               FROM markets m
               LEFT JOIN snapshots s ON s.market_id = m.market_id
                 AND s.ts = (SELECT MAX(ts) FROM snapshots WHERE market_id = m.market_id)
               ORDER BY m.volume_usdc DESC NULLS LAST"#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows
            .iter()
            .map(|r| {
                serde_json::json!({
                    "marketId": r.get::<String, _>("market_id"),
                    "category": r.get::<Option<String>, _>("category"),
                    "title": r.get::<Option<String>, _>("title"),
                    "status": r.get::<Option<String>, _>("status"),
                    "phase": r.get::<Option<String>, _>("phase"),
                    "endTime": r.get::<Option<i64>, _>("end_time"),
                    "volumeUsdc": r.get::<Option<f64>, _>("volume_usdc"),
                    "yesPrice": r.get::<Option<f64>, _>("yes_price"),
                    "noPrice": r.get::<Option<f64>, _>("no_price"),
                    "priceTs": r.get::<Option<i64>, _>("price_ts"),
                    "firstSeen": r.get::<i64, _>("first_seen"),
                    "lastSeen": r.get::<i64, _>("last_seen"),
                })
            })
            .collect())
    }

    /// Smart-money leaderboard: volume/activity over the whole tape, plus
    /// realized PnL on resolved markets (avg YES buy price vs outcome).
    pub async fn wallet_leaderboard(&self, limit: i64) -> Result<Vec<WalletStat>, sqlx::Error> {
        let rows = sqlx::query(
            r#"SELECT wallet, COUNT(*) AS n, CAST(COALESCE(SUM(amount_usdc),0) AS REAL) AS vol,
                      COUNT(DISTINCT market_id) AS mkts, MAX(ts) AS last_ts
               FROM trades WHERE wallet IS NOT NULL AND wallet != ''
               GROUP BY wallet ORDER BY vol DESC LIMIT ?1"#,
        )
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        let mut out = Vec::new();
        for r in rows {
            let wallet: String = r.get("wallet");
            // Realized PnL on resolved markets: outcome price = yes_price of last snapshot (1 or 0)
            let pnl_row = sqlx::query(
                r#"SELECT
                     CAST(SUM(CASE WHEN t.side='yes' THEN t.amount_usdc * (s.last_price - t.price) / NULLIF(t.price,0) ELSE 0 END) AS REAL) AS pnl,
                     SUM(CASE WHEN t.side='yes' AND s.last_price >= 0.99 THEN 1 WHEN t.side='yes' AND s.last_price <= 0.01 THEN 0 ELSE 0 END) AS wins,
                     SUM(CASE WHEN t.side='yes' AND s.last_price <= 0.01 THEN 1 WHEN t.side='yes' AND s.last_price >= 0.99 THEN 0 ELSE 0 END) AS losses
                   FROM trades t
                   JOIN (SELECT market_id, yes_price AS last_price FROM snapshots s2
                         WHERE s2.ts = (SELECT MAX(ts) FROM snapshots WHERE market_id = s2.market_id)) s
                     ON s.market_id = t.market_id
                   WHERE t.wallet = ?1 AND t.price IS NOT NULL
                     AND (s.last_price >= 0.99 OR s.last_price <= 0.01)"#,
            )
            .bind(&wallet)
            .fetch_one(&self.pool)
            .await?;
            out.push(WalletStat {
                wallet,
                trades: r.get("n"),
                volume_usdc: r.get("vol"),
                markets_touched: r.get("mkts"),
                last_active: r.get("last_ts"),
                realized_pnl: pnl_row.try_get("pnl").ok(),
                wins: pnl_row.try_get("wins").unwrap_or(0),
                losses: pnl_row.try_get("losses").unwrap_or(0),
            });
        }
        Ok(out)
    }
}
