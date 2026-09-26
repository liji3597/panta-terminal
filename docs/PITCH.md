# Pitch Deck Outline — Panta Terminal (10 slides)

For the Colosseum main track. Build in any deck tool; pull live numbers (markets tracked, snapshots stored, wallets ranked) from `/api/health` and `/api/markets` before recording.

1. **Title** — Panta Terminal: the TradingView for on-chain prediction markets. Logo + live screenshot of the radar.
2. **Problem** — Prediction-market APIs (Panta on Solana) expose markets but no market *data*: no price history, no real-time feed, no trader analytics. Every builder re-implements polling; every trader flies blind.
3. **Solution** — A data terminal: 30-second full-catalog snapshots → OHLC history → WebSocket push → smart-money rankings → non-custodial trading, all in one surface.
4. **Product** — 4 screenshots: radar, K-line terminal, leaderboard, portfolio/claim. Emphasize the chart label: "not available on panta.market".
5. **Tech** — Architecture diagram: Panta API → Rust (axum/tokio/SQLite, rate-limit-aware fan-out) → WebSocket → Next.js. Note: API key server-side, wallets sign client-side.
6. **Traction** — Live counters: markets tracked, snapshots stored, trades persisted, wallets ranked. (These grow every minute the server runs — say that out loud.)
7. **Market** — Prediction markets did $44B+ volume in 2025 across 32+ venues; Solana's venue just opened its API and has zero data tooling. We're first.
8. **Business model** — Free terminal; paid tier for alerts + historical-data API; attributed-volume fee share with Panta.
9. **Roadmap** — Telegram/browser alerts → public history API → multi-venue (same core, new adapters) → creator analytics.
10. **Team / Ask** — Solo builder, Solana + exchange-backend background. Ask: Colosseum accelerator; intros to venues that need this layer.

## Speaker notes

- Slide 6 is the killer: the numbers tick up live because the product is *running*, not mocked.
- If asked about competition (Sonar et al.): they analyze whether to buy; we provide the data infrastructure everyone — including them — needs.
