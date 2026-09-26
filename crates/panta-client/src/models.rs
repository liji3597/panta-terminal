//! API models. Everything is generously optional — the catalog schema has
//! already surprised us once (empty titles in list rows) and we never want a
//! new/empty field to break deserialization.

use serde::{Deserialize, Serialize};

#[derive(Debug, Default)]
pub struct ListParams {
    pub category: Option<String>,
    pub status: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<u32>,
    pub created_by_me: bool,
}

#[derive(Debug, Deserialize)]
pub struct ListResponse<T> {
    #[serde(default)]
    pub items: Vec<T>,
    #[serde(default)]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MarketRow {
    pub market_id: String,
    pub category: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub images: Vec<String>,
    pub phase: Option<String>,
    pub market_type: Option<String>,
    pub start_time: Option<i64>,
    pub end_time: Option<i64>,
    pub resolution_time: Option<i64>,
    pub region: Option<String>,
    pub resolved: Option<bool>,
    pub status: Option<String>,
    pub volume_usdc: Option<String>,
    pub yes_price: Option<serde_json::Value>,
    pub no_price: Option<serde_json::Value>,
    pub primary_yes_price: Option<serde_json::Value>,
    pub primary_no_price: Option<serde_json::Value>,
    pub secondary_yes_price: Option<serde_json::Value>,
    pub secondary_no_price: Option<serde_json::Value>,
    pub price_source: Option<String>,
    pub valuation_status: Option<String>,
}

impl Default for MarketRow {
    fn default() -> Self {
        Self {
            market_id: String::new(),
            category: None,
            title: None,
            description: None,
            images: Vec::new(),
            phase: None,
            market_type: None,
            start_time: None,
            end_time: None,
            resolution_time: None,
            region: None,
            resolved: None,
            status: None,
            volume_usdc: None,
            yes_price: None,
            no_price: None,
            primary_yes_price: None,
            primary_no_price: None,
            secondary_yes_price: None,
            secondary_no_price: None,
            price_source: None,
            valuation_status: None,
        }
    }
}

/// Detail rows are a superset of list rows; `onChain` is opaque for now and
/// passed through so the frontend can use whatever Panta adds there.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MarketDetail {
    #[serde(flatten)]
    pub row: MarketRow,
    pub question: Option<String>,
    pub resolution_rule: Option<String>,
    pub sources_of_truth: Option<Vec<String>>,
    pub on_chain: Option<serde_json::Value>,
}

impl Default for MarketDetail {
    fn default() -> Self {
        Self {
            row: MarketRow::default(),
            question: None,
            resolution_rule: None,
            sources_of_truth: None,
            on_chain: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Trade {
    pub id: Option<String>,
    pub market_id: Option<String>,
    pub wallet: Option<String>,
    pub side: Option<String>,
    pub kind: Option<String>,
    pub is_primary: Option<bool>,
    pub amount_usdc: Option<serde_json::Value>,
    pub amount_usdc_base: Option<serde_json::Value>,
    /// YES/NO leg amounts in USDC base units (numbers, 6 decimals).
    pub yes_amount: Option<f64>,
    pub no_amount: Option<f64>,
    pub shares: Option<String>,
    pub shares_base: Option<String>,
    pub price: Option<serde_json::Value>,
    pub signature: Option<String>,
    pub timestamp: Option<i64>,
    /// Actual tape field carrying unix seconds.
    pub block_time: Option<i64>,
}

impl Default for Trade {
    fn default() -> Self {
        Self {
            id: None,
            market_id: None,
            wallet: None,
            side: None,
            kind: None,
            is_primary: None,
            amount_usdc: None,
            amount_usdc_base: None,
            yes_amount: None,
            no_amount: None,
            shares: None,
            shares_base: None,
            price: None,
            signature: None,
            timestamp: None,
            block_time: None,
        }
    }
}

impl Trade {
    /// Event time in unix seconds.
    pub fn ts(&self) -> Option<i64> {
        self.block_time.or(self.timestamp)
    }

    /// USDC amount of the trade. `amountUsdc` is often null on primary buys;
    /// fall back to the YES/NO leg base units (6 decimals).
    pub fn usdc_amount(&self) -> Option<f64> {
        if let Some(v) = &self.amount_usdc {
            let n = match v {
                serde_json::Value::String(s) => s.parse::<f64>().ok(),
                serde_json::Value::Number(n) => n.as_f64(),
                _ => None,
            };
            if let Some(n) = n {
                return Some(n);
            }
        }
        match (self.yes_amount, self.no_amount) {
            (None, None) => None,
            (y, n) => Some((y.unwrap_or(0.0) + n.unwrap_or(0.0)) / 1e6),
        }
    }

    /// Implied execution price (USDC per share) when derivable.
    pub fn implied_price(&self) -> Option<f64> {
        if let Some(p) = self.price.as_ref().and_then(crate::norm_price) {
            return Some(p);
        }
        let amt = self.usdc_amount()?;
        let shares = self.shares.as_deref().and_then(|s| s.parse::<f64>().ok())
            .or_else(|| self.shares_base.as_deref().and_then(|s| s.parse::<f64>().ok()).map(|v| v / 1e6))?;
        if shares > 0.0 {
            Some(amt / shares)
        } else {
            None
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct TradesResponse {
    #[serde(default)]
    pub items: Vec<Trade>,
}

#[derive(Debug, Deserialize)]
pub struct CategoriesResponse {
    #[serde(default)]
    pub categories: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub user_id: String,
    pub email: String,
    pub name: String,
    pub status: String,
    #[serde(default)]
    pub can_create_markets: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuyQuoteRequest {
    pub wallet: String,
    pub market_id: String,
    pub side: String, // "yes" | "no"
    /// Human-readable decimal string, e.g. "20.00" (USDC).
    pub amount_usdc: String,
}
