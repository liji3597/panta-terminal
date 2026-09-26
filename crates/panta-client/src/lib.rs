//! Typed async client for the Panta prediction-market API.
//!
//! Docs: https://docs.panta.market — base URL `https://live-api.panta.market/api/v1`.
//! All routes require trailing slashes and an `X-Api-Key` header.

pub mod models;
mod rate_limit;

use rate_limit::TokenBucket;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, CONTENT_TYPE, USER_AGENT};
use serde::de::DeserializeOwned;
use std::sync::Arc;
use std::time::Duration;

pub const DEFAULT_BASE_URL: &str = "https://live-api.panta.market/api/v1";

/// Which API credential to use. Both work on the public API; `Test` never
/// touches Solana and is what demo/sandbox flows should use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Env {
    Live,
    Test,
}

#[derive(Debug, thiserror::Error)]
pub enum PantaError {
    #[error("http transport: {0}")]
    Transport(#[from] reqwest::Error),
    #[error("api error {status} {code}: {message}")]
    Api {
        status: u16,
        code: String,
        message: String,
    },
    #[error("rate limited and retries exhausted")]
    RateLimited,
    #[error("missing api key for env {0:?}")]
    MissingKey(Env),
    #[error("response decode: {0}")]
    Decode(#[from] serde_json::Error),
}

#[derive(Debug, serde::Deserialize)]
struct ErrorBody {
    code: Option<String>,
    message: Option<String>,
}

#[derive(Clone)]
pub struct PantaClient {
    http: reqwest::Client,
    base: String,
    live_key: Option<String>,
    test_key: Option<String>,
    /// Panta read limit is 120 req / 60 s; we stay well under it.
    read_limiter: Arc<TokenBucket>,
    write_limiter: Arc<TokenBucket>,
}

impl PantaClient {
    pub fn new(live_key: Option<String>, test_key: Option<String>) -> Self {
        Self::with_base(DEFAULT_BASE_URL, live_key, test_key)
    }

    pub fn with_base(base: impl Into<String>, live_key: Option<String>, test_key: Option<String>) -> Self {
        let mut headers = HeaderMap::new();
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(USER_AGENT, HeaderValue::from_static("panta-terminal/0.1"));
        let http = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(Duration::from_secs(30))
            .build()
            .expect("reqwest client");
        Self {
            http,
            base: base.into(),
            live_key,
            test_key,
            read_limiter: Arc::new(TokenBucket::new(100, Duration::from_secs(60))),
            write_limiter: Arc::new(TokenBucket::new(25, Duration::from_secs(60))),
        }
    }

    pub fn from_env() -> Self {
        let base = std::env::var("PANTA_API_BASE_URL")
            .unwrap_or_else(|_| DEFAULT_BASE_URL.to_string());
        Self::with_base(
            base,
            std::env::var("PANTA_API_KEY").ok(),
            std::env::var("PANTA_TEST_API_KEY").ok(),
        )
    }

    fn key(&self, env: Env) -> Result<&str, PantaError> {
        let k = match env {
            Env::Live => &self.live_key,
            Env::Test => &self.test_key,
        };
        k.as_deref().ok_or(PantaError::MissingKey(env))
    }

    async fn request<T: DeserializeOwned>(
        &self,
        method: reqwest::Method,
        path: &str,
        body: Option<serde_json::Value>,
        env: Env,
        user_id: Option<&str>,
    ) -> Result<T, PantaError> {
        let is_write = method != reqwest::Method::GET;
        if is_write {
            self.write_limiter.take().await;
        } else {
            self.read_limiter.take().await;
        }
        let url = format!(
            "{}{}",
            self.base.trim_end_matches('/'),
            if path.starts_with('/') { path.to_string() } else { format!("/{path}") }
        );
        let mut retries = 2u8;
        loop {
            let mut req = self
                .http
                .request(method.clone(), &url)
                .header("X-Api-Key", self.key(env)?);
            if let Some(uid) = user_id {
                req = req.header("X-User-Id", uid);
            }
            if let Some(b) = &body {
                req = req.header(CONTENT_TYPE, "application/json").json(b);
            }
            let res = req.send().await?;
            let status = res.status();
            if status.as_u16() == 429 && retries > 0 {
                retries -= 1;
                let wait = res
                    .headers()
                    .get("retry-after")
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.parse::<u64>().ok())
                    .unwrap_or(2);
                tokio::time::sleep(Duration::from_secs_f64(wait as f64 + rand_jitter())).await;
                continue;
            }
            let text = res.text().await?;
            if !status.is_success() {
                let parsed: ErrorBody = serde_json::from_str(&text).unwrap_or(ErrorBody {
                    code: Some(format!("HTTP_{}", status.as_u16())),
                    message: Some(text.chars().take(200).collect()),
                });
                return Err(PantaError::Api {
                    status: status.as_u16(),
                    code: parsed.code.unwrap_or_else(|| "UNKNOWN".into()),
                    message: parsed.message.unwrap_or_default(),
                });
            }
            return Ok(serde_json::from_str(&text)?);
        }
    }

    // ---------- Reads ----------

    pub async fn list_markets(
        &self,
        q: &models::ListParams,
        env: Env,
    ) -> Result<models::ListResponse<models::MarketRow>, PantaError> {
        let mut qs = vec![format!("limit={}", q.limit.unwrap_or(50).min(50))];
        if let Some(c) = &q.category { qs.push(format!("category={c}")); }
        if let Some(s) = &q.status { qs.push(format!("status={s}")); }
        if let Some(c) = &q.cursor { qs.push(format!("cursor={c}")); }
        if q.created_by_me { qs.push("createdBy=me".into()); }
        self.request(reqwest::Method::GET, &format!("/markets/?{}", qs.join("&")), None, env, None).await
    }

    /// The catalog cursor currently loops (same rows each page), so full
    /// coverage comes from fanning out over status × category and deduping.
    pub async fn list_open_markets(&self, env: Env) -> Result<Vec<models::MarketRow>, PantaError> {
        const CATS: [&str; 9] = ["", "sports", "crypto", "politics", "entertainment", "finance", "science", "world", "other"];
        let mut seen = std::collections::HashMap::new();
        let mut first_err = None;
        for status in ["primary", "secondary"] {
            for cat in CATS {
                let q = models::ListParams {
                    status: Some(status.into()),
                    category: if cat.is_empty() { None } else { Some(cat.into()) },
                    limit: Some(50),
                    ..Default::default()
                };
                match self.list_markets(&q, env).await {
                    Ok(r) => {
                        for m in r.items {
                            seen.entry(m.market_id.clone()).or_insert(m);
                        }
                    }
                    Err(e) => {
                        tracing::warn!(%status, %cat, error = %e, "list partition failed");
                        if first_err.is_none() { first_err = Some(e); }
                    }
                }
            }
        }
        let out: Vec<_> = seen.into_values().collect();
        if out.is_empty() {
            if let Some(e) = first_err { return Err(e); }
        }
        Ok(out)
    }

    pub async fn get_market(&self, id: &str, env: Env) -> Result<models::MarketDetail, PantaError> {
        self.request(reqwest::Method::GET, &format!("/markets/{id}/"), None, env, None).await
    }

    pub async fn get_market_trades(&self, id: &str, limit: u32, env: Env) -> Result<models::TradesResponse, PantaError> {
        self.request(reqwest::Method::GET, &format!("/markets/{id}/trades/?limit={}", limit.min(200)), None, env, None).await
    }

    pub async fn get_wallet_trades(&self, wallet: &str, limit: u32, env: Env) -> Result<models::TradesResponse, PantaError> {
        self.request(reqwest::Method::GET, &format!("/wallets/{wallet}/trades/?limit={}", limit.min(200)), None, env, None).await
    }

    pub async fn get_positions(&self, wallet: &str, env: Env) -> Result<serde_json::Value, PantaError> {
        self.request(reqwest::Method::GET, &format!("/positions/?wallet={wallet}"), None, env, None).await
    }

    pub async fn get_categories(&self, env: Env) -> Result<models::CategoriesResponse, PantaError> {
        self.request(reqwest::Method::GET, "/categories/", None, env, None).await
    }

    pub async fn get_account(&self, env: Env) -> Result<models::Account, PantaError> {
        self.request(reqwest::Method::GET, "/account/", None, env, None).await
    }

    // ---------- Primary buy: quote → build → submit → verify ----------

    pub async fn quote_buy(&self, body: &models::BuyQuoteRequest, env: Env) -> Result<serde_json::Value, PantaError> {
        self.request(reqwest::Method::POST, "/primaryorderquote/", Some(serde_json::to_value(body).unwrap()), env, None).await
    }

    pub async fn build_buy(&self, quote_id: &str, wallet: &str, max_slippage_bps: Option<u32>, env: Env) -> Result<serde_json::Value, PantaError> {
        let body = serde_json::json!({"quoteId": quote_id, "wallet": wallet, "maxSlippageBps": max_slippage_bps.unwrap_or(100)});
        self.request(reqwest::Method::POST, "/primaryorderbuild/", Some(body), env, None).await
    }

    pub async fn submit_buy(&self, order_id: &str, signature: &str, env: Env) -> Result<serde_json::Value, PantaError> {
        let body = serde_json::json!({"orderId": order_id, "signature": signature});
        self.request(reqwest::Method::POST, "/primaryordersubmit/", Some(body), env, None).await
    }

    pub async fn verify_buy(&self, order_id: &str, signature: Option<&str>, env: Env) -> Result<serde_json::Value, PantaError> {
        let mut body = serde_json::json!({"orderId": order_id});
        if let Some(s) = signature { body["signature"] = s.into(); }
        self.request(reqwest::Method::POST, "/primaryorderverify/", Some(body), env, None).await
    }

    // ---------- Claims + attribution ----------

    pub async fn build_claim(&self, wallet: &str, market_id: &str, env: Env) -> Result<serde_json::Value, PantaError> {
        let body = serde_json::json!({"wallet": wallet, "marketId": market_id});
        self.request(reqwest::Method::POST, "/claim/build/", Some(body), env, None).await
    }

    pub async fn build_creator_fees(&self, wallet: &str, market_id: &str, env: Env) -> Result<serde_json::Value, PantaError> {
        let body = serde_json::json!({"wallet": wallet, "marketId": market_id});
        self.request(reqwest::Method::POST, "/claim/creator-fees/build/", Some(body), env, None).await
    }

    pub async fn report_trade(&self, signature: &str, kind: Option<&str>, env: Env) -> Result<serde_json::Value, PantaError> {
        let mut body = serde_json::json!({"signature": signature});
        if let Some(k) = kind { body["kind"] = k.into(); }
        self.request(reqwest::Method::POST, "/trades/", Some(body), env, None).await
    }

    pub async fn trade_status(&self, signature: &str, env: Env) -> Result<serde_json::Value, PantaError> {
        self.request(reqwest::Method::GET, &format!("/trades/{signature}/"), None, env, None).await
    }
}

fn rand_jitter() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().subsec_nanos();
    (nanos % 1000) as f64 / 1000.0
}

/// Panta returns prices both as "0.43" decimal strings and as 1e9-scaled
/// integer strings depending on the field — normalize to 0..=1.
pub fn norm_price(v: &serde_json::Value) -> Option<f64> {
    let n = match v {
        serde_json::Value::String(s) => s.parse::<f64>().ok()?,
        serde_json::Value::Number(n) => n.as_f64()?,
        _ => return None,
    };
    if !n.is_finite() { return None; }
    Some(if n > 1.0001 { n / 1e9 } else { n })
}
