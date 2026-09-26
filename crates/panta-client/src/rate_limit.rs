use std::sync::Mutex;
use std::time::{Duration, Instant};

/// Simple token bucket so one process never trips Panta's rate limits.
pub struct TokenBucket {
    max: usize,
    window: Duration,
    stamps: Mutex<Vec<Instant>>,
}

impl TokenBucket {
    pub fn new(max: usize, window: Duration) -> Self {
        Self { max, window, stamps: Mutex::new(Vec::new()) }
    }

    pub async fn take(&self) {
        loop {
            let wait = {
                let mut stamps = self.stamps.lock().unwrap();
                let now = Instant::now();
                stamps.retain(|t| now.duration_since(*t) < self.window);
                if stamps.len() < self.max {
                    stamps.push(now);
                    return;
                }
                self.window - now.duration_since(stamps[0]) + Duration::from_millis(25)
            };
            tokio::time::sleep(wait).await;
        }
    }
}
