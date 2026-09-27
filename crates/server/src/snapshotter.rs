//! Background ingest: every 30 s fan out over status × category, upsert the
//! registry, record a price snapshot per market, and broadcast live events.
//! Also drips detail fetches (titles) and trade tapes within the rate budget.

use crate::store::Store;
use panta_client::{norm_price, Env, PantaClient};
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum LiveEvent {
    #[serde(rename_all = "camelCase")]
    Tick { ts: i64, markets: usize },
    #[serde(rename_all = "camelCase")]
    Price {
        market_id: String,
        ts: i64,
        yes_price: f64,
        volume_usdc: Option<f64>,
    },
    #[serde(rename_all = "camelCase")]
    Trade {
        market_id: String,
        wallet: Option<String>,
        side: Option<String>,
        amount_usdc: Option<f64>,
        ts: Option<i64>,
    },
}

fn now() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_secs() as i64
}

fn row_yes_price(m: &panta_client::models::MarketRow) -> Option<f64> {
    m.yes_price.as_ref().and_then(norm_price)
        .or_else(|| m.primary_yes_price.as_ref().and_then(norm_price))
        .or_else(|| m.secondary_yes_price.as_ref().and_then(norm_price))
}

pub fn spawn(client: PantaClient, store: Store) -> broadcast::Sender<LiveEvent> {
    let (tx, _) = broadcast::channel(512);
    let tx2 = tx.clone();
    tokio::spawn(async move {
        let mut drip_cursor = 0usize;
        loop {
            let started = std::time::Instant::now();
            if let Err(e) = tick(&client, &store, &tx2, &mut drip_cursor).await {
                tracing::error!(error = %e, "snapshot tick failed");
            }
            let elapsed = started.elapsed();
            let interval = std::time::Duration::from_secs(30);
            if elapsed < interval {
                tokio::time::sleep(interval - elapsed).await;
            }
        }
    });
    tx
}

async fn tick(
    client: &PantaClient,
    store: &Store,
    tx: &broadcast::Sender<LiveEvent>,
    drip_cursor: &mut usize,
) -> Result<(), panta_client::PantaError> {
    let ts = now();
    let markets = client.list_open_markets(Env::Live).await?;
    let n = markets.len();

    let mut actives: Vec<(String, f64)> = Vec::new();
    for m in &markets {
        store.upsert_market(m, ts).await.ok();
        let yes = row_yes_price(m);
        let vol = m.volume_usdc.as_deref().and_then(|v| v.parse::<f64>().ok());
        if yes.is_some() {
            // skip a redundant write if nothing moved since last snapshot
            let prev = store.latest_snapshot(&m.market_id).await.ok().flatten();
            let moved = match prev {
                Some((_, Some(py), _, _)) => yes.map(|y| (y - py).abs() > 1e-9).unwrap_or(true),
                _ => true,
            };
            if moved {
                store.insert_snapshot(&m.market_id, ts, yes, m.no_price.as_ref().and_then(norm_price), vol).await.ok();
                if let Some(y) = yes {
                    let _ = tx.send(LiveEvent::Price { market_id: m.market_id.clone(), ts, yes_price: y, volume_usdc: vol });
                }
            }
        }
        let status = m.status.as_deref().unwrap_or("");
        if status.contains("active") || m.phase.as_deref() == Some("primary") {
            actives.push((m.market_id.clone(), vol.unwrap_or(0.0)));
        }
    }
    let _ = tx.send(LiveEvent::Tick { ts, markets: n });

    // detail drip: titles for markets we haven't cached yet (5 per tick)
    let mut need_titles = Vec::new();
    for m in &markets {
        if m.title.as_deref().map(|t| t.is_empty()).unwrap_or(true) {
            need_titles.push(m.market_id.clone());
        }
    }
    for id in need_titles.iter().skip(*drip_cursor % need_titles.len().max(1)).take(12) {
        // Upstream intermittently returns empty titles — retry twice before caching.
        let mut detail = client.get_market(id, Env::Live).await;
        for _ in 0..2 {
            let titled = detail.as_ref().map(|d| {
                d.question.as_deref().map(|t| !t.is_empty()).unwrap_or(false)
                    || d.row.title.as_deref().map(|t| !t.is_empty()).unwrap_or(false)
            }).unwrap_or(false);
            if titled { break; }
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            detail = client.get_market(id, Env::Live).await;
        }
        if let Ok(d) = detail {
            let title = d.question.clone().or(d.row.title.clone());
            let v = serde_json::to_value(&d).unwrap_or_default();
            store.cache_detail(id, title.as_deref(), &v, ts).await.ok();
        }
    }
    *drip_cursor = drip_cursor.wrapping_add(12);

    // trades drip: top-volume markets regardless of phase (resolved markets
    // keep their tapes — that's leaderboard history), rotating 15 per tick
    let mut by_vol: Vec<(String, f64)> = markets
        .iter()
        .map(|m| (m.market_id.clone(), m.volume_usdc.as_deref().and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0)))
        .collect();
    by_vol.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    let tape_n = by_vol.len().max(1);
    for (id, vol) in by_vol.iter().skip(*drip_cursor % tape_n).take(15) {
        if *vol == 0.0 && !id.is_empty() && !actives.iter().any(|a| a.0 == *id) {
            continue; // skip dead zero-volume markets
        }
        if let Ok(tape) = client.get_market_trades(id, 100, Env::Live).await {
            for t in &tape.items {
                if let Ok(true) = store.insert_trade(id, t).await {
                    let _ = tx.send(LiveEvent::Trade {
                        market_id: id.clone(),
                        wallet: t.wallet.clone(),
                        side: t.side.clone(),
                        amount_usdc: t.usdc_amount(),
                        ts: t.ts(),
                    });
                }
            }
        }
    }
    tracing::info!(markets = n, active = actives.len(), "snapshot tick done");
    Ok(())
}
