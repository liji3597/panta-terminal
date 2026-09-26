//! Panta Terminal backend — axum server over the Panta API + our own
//! snapshot/OHLC/trade-tape data layer.

mod snapshotter;
mod store;
mod ws;

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::Json,
    routing::get,
    Router,
};
use panta_client::{Env, PantaClient};
use serde::Deserialize;
use std::sync::Arc;
use store::Store;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::EnvFilter;

pub struct AppState {
    panta: PantaClient,
    store: Store,
    events: tokio::sync::broadcast::Sender<snapshotter::LiveEvent>,
}

#[derive(Debug, Deserialize)]
struct EnvQuery {
    env: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TradesQuery {
    env: Option<String>,
    limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct CandlesQuery {
    /// bucket seconds: 60 (1m), 300 (5m), 3600 (1h)
    interval: Option<i64>,
    limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct LeaderboardQuery {
    limit: Option<i64>,
}

fn parse_env(q: &Option<String>) -> Env {
    match q.as_deref() {
        Some("test") | Some("sandbox") => Env::Test,
        _ => Env::Live,
    }
}

fn err(e: impl std::fmt::Display) -> (StatusCode, Json<serde_json::Value>) {
    tracing::error!(error = %e, "request failed");
    (
        StatusCode::BAD_GATEWAY,
        Json(serde_json::json!({ "error": e.to_string() })),
    )
}

async fn health(State(st): State<Arc<AppState>>) -> Json<serde_json::Value> {
    let snap_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM snapshots")
        .fetch_one(&st.store.pool)
        .await
        .unwrap_or(0);
    Json(serde_json::json!({
        "status": "ok",
        "service": "panta-terminal",
        "snapshots": snap_count,
    }))
}

#[derive(Debug, Deserialize)]
struct RadarQuery {
    env: Option<String>,
    /// `live` = fan out over the Panta API now; default = our snapshot store.
    source: Option<String>,
}

/// Radar: our own registry (kept fresh by the snapshotter). `?source=live`
/// fans out over the Panta API directly — slow, for debugging only.
async fn radar(
    State(st): State<Arc<AppState>>,
    Query(q): Query<RadarQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if q.source.as_deref() == Some("live") {
        let markets = st.panta.list_open_markets(parse_env(&q.env)).await.map_err(err)?;
        return Ok(Json(serde_json::json!({
            "source": "live",
            "count": markets.len(),
            "items": markets,
        })));
    }
    let items = st.store.radar_rows().await.map_err(err)?;
    Ok(Json(serde_json::json!({
        "source": "store",
        "count": items.len(),
        "items": items,
    })))
}

/// Market detail, served from our cache when available (Panta has no history
/// endpoint; titles don't ship in list rows).
async fn market_detail(
    State(st): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<EnvQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if let Ok(Some(cached)) = st.store.cached_detail(&id).await {
        let mut v = cached;
        v["cached"] = serde_json::Value::Bool(true);
        return Ok(Json(v));
    }
    let d = st.panta.get_market(&id, parse_env(&q.env)).await.map_err(err)?;
    let v = serde_json::to_value(&d).unwrap();
    let title = d.question.clone().or(d.row.title.clone());
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    st.store.cache_detail(&id, title.as_deref(), &v, now).await.ok();
    Ok(Json(v))
}

async fn market_trades(
    State(st): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<TradesQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let t = st
        .panta
        .get_market_trades(&id, q.limit.unwrap_or(200), parse_env(&q.env))
        .await
        .map_err(err)?;
    // opportunistically persist the tape
    for trade in &t.items {
        st.store.insert_trade(&id, trade).await.ok();
    }
    Ok(Json(serde_json::to_value(t.items).unwrap()))
}

/// OHLC candles from our own snapshots — the price history Panta doesn't have.
async fn market_candles(
    State(st): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<CandlesQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let interval = match q.interval.unwrap_or(300) {
        i if [60, 300, 900, 1800, 3600, 86400].contains(&i) => i,
        _ => 300,
    };
    let candles = st
        .store
        .candles(&id, interval, q.limit.unwrap_or(200).min(1000))
        .await
        .map_err(err)?;
    Ok(Json(serde_json::json!({
        "marketId": id,
        "interval": interval,
        "count": candles.len(),
        "candles": candles,
    })))
}

/// Smart-money leaderboard from the collected trade tape.
async fn leaderboard(
    State(st): State<Arc<AppState>>,
    Query(q): Query<LeaderboardQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let rows = st
        .store
        .wallet_leaderboard(q.limit.unwrap_or(50).min(200))
        .await
        .map_err(err)?;
    Ok(Json(serde_json::json!({ "count": rows.len(), "items": rows })))
}

// ---------- Trading proxy (non-custodial): quote → build → sign → submit ----------

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct QuoteBody {
    wallet: String,
    market_id: String,
    side: String,
    amount_usdc: String,
    env: Option<String>,
}

async fn trade_quote(
    State(st): State<Arc<AppState>>,
    Json(b): Json<QuoteBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if !["yes", "no"].contains(&b.side.as_str()) {
        return Err(err("side must be yes|no"));
    }
    let req = panta_client::models::BuyQuoteRequest {
        wallet: b.wallet,
        market_id: b.market_id,
        side: b.side,
        amount_usdc: b.amount_usdc,
    };
    let v = st.panta.quote_buy(&req, parse_env(&b.env)).await.map_err(err)?;
    Ok(Json(v))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BuildBody {
    quote_id: String,
    wallet: String,
    max_slippage_bps: Option<u32>,
    env: Option<String>,
}

async fn trade_build(
    State(st): State<Arc<AppState>>,
    Json(b): Json<BuildBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let env = parse_env(&b.env);
    let v = st
        .panta
        .build_buy(&b.quote_id, &b.wallet, b.max_slippage_bps, env)
        .await
        .map_err(err)?;
    Ok(Json(v))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubmitBody {
    order_id: String,
    signature: String,
    env: Option<String>,
}

async fn trade_submit(
    State(st): State<Arc<AppState>>,
    Json(b): Json<SubmitBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let env = parse_env(&b.env);
    let v = st.panta.submit_buy(&b.order_id, &b.signature, env).await.map_err(err)?;
    // attribution is idempotent; report the trade kind as buy
    st.panta.report_trade(&b.signature, Some("buy"), env).await.ok();
    Ok(Json(v))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct VerifyBody {
    order_id: String,
    signature: Option<String>,
    env: Option<String>,
}

async fn trade_verify(
    State(st): State<Arc<AppState>>,
    Json(b): Json<VerifyBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let env = parse_env(&b.env);
    let v = st
        .panta
        .verify_buy(&b.order_id, b.signature.as_deref(), env)
        .await
        .map_err(err)?;
    Ok(Json(v))
}

#[derive(Debug, Deserialize)]
struct PositionsQuery {
    wallet: String,
    env: Option<String>,
}

async fn positions(
    State(st): State<Arc<AppState>>,
    Query(q): Query<PositionsQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let v = st.panta.get_positions(&q.wallet, parse_env(&q.env)).await.map_err(err)?;
    Ok(Json(v))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClaimBody {
    wallet: String,
    market_id: String,
    env: Option<String>,
}

async fn claim_build(
    State(st): State<Arc<AppState>>,
    Json(b): Json<ClaimBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let env = parse_env(&b.env);
    let v = st.panta.build_claim(&b.wallet, &b.market_id, env).await.map_err(err)?;
    Ok(Json(v))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReportBody {
    signature: String,
    kind: Option<String>,
    env: Option<String>,
}

/// File an on-chain signature with Panta for trade attribution (buy/claim).
async fn trade_report(
    State(st): State<Arc<AppState>>,
    Json(b): Json<ReportBody>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let env = parse_env(&b.env);
    let v = st
        .panta
        .report_trade(&b.signature, b.kind.as_deref(), env)
        .await
        .map_err(err)?;
    Ok(Json(v))
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()))
        .init();

    let db_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://panta-terminal.db".into());
    let store = Store::open(&db_url).await.expect("open sqlite");
    let panta = PantaClient::from_env();
    let events = snapshotter::spawn(panta.clone(), store.clone());

    let state = Arc::new(AppState { panta, store, events });

    let app = Router::new()
        .route("/api/health", get(health))
        .route("/api/markets", get(radar))
        .route("/api/markets/{id}", get(market_detail))
        .route("/api/markets/{id}/trades", get(market_trades))
        .route("/api/markets/{id}/candles", get(market_candles))
        .route("/api/leaderboard", get(leaderboard))
        .route("/api/trade/quote", axum::routing::post(trade_quote))
        .route("/api/trade/build", axum::routing::post(trade_build))
        .route("/api/trade/submit", axum::routing::post(trade_submit))
        .route("/api/trade/verify", axum::routing::post(trade_verify))
        .route("/api/positions", get(positions))
        .route("/api/claim/build", axum::routing::post(claim_build))
        .route("/api/trade/report", axum::routing::post(trade_report))
        .route("/ws", get(ws::handler))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".into());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("bind");
    tracing::info!("panta-terminal-server listening on http://localhost:{port}");
    axum::serve(listener, app).await.expect("serve");
}
