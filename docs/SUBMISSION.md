# Submission Drafts

## Panta API Sidetrack (Superteam Earn)

**Project name**: Panta Terminal

**Short description** (form):
> The market-data terminal for Panta prediction markets. A Rust ingestion core snapshots every market every 30 s and serves the ecosystem's first price-history charts (Panta's API has no history endpoint), a WebSocket live feed, a smart-money leaderboard built from trade tapes we persist, and a fully non-custodial buy/claim flow (quote → build → wallet sign → broadcast → verify). Sandbox mode demonstrates the entire loop with zero funds.

**Links**: live URL · GitHub repo · demo video · (X post tagging @PantaHQ)

**Country**: (fill in your location)

**Key talking points for the judges' comment box**:
- Uses Panta API surface end-to-end: markets list/detail, trades, positions, primary buy (quote/build/submit/verify), claim build, trade attribution reporting.
- Non-custodial by design: API key server-side only, all txs signed client-side.
- Fills two structural API gaps (no history, no push) — infrastructure-level value, not a reskin.
- Documented API feedback below — direct value back to Panta.

### Panta API feedback we can report (found while building)

1. List cursor pagination loops — every page returns the same rows; full coverage requires status × category fan-out.
2. Price fields arrive in two formats (`"0.43"` vs 1e9-scaled strings) — needs a normalization rule in docs.
3. List rows ship empty `title` — forces N detail calls for basic display.
4. The detail endpoint itself intermittently returns empty `title`/`question` (~1 in 8 calls; load-balanced backends disagree) — consumers must retry or risk caching titleless payloads.
4. Trade tape uses `blockTime`, and `amountUsdc` is often null on primary buys — amounts must be derived from `yesAmount`/`noAmount` base units.
5. Some resolved/high-volume markets return empty historical tapes while others persist — inconsistent retention.
6. Undocumented categories appear in the catalog (stocks, commodities).
7. No websocket or webhook — every consumer must poll. (We built a push layer; happy to upstream the design.)

## Colosseum Crypto World's Fair — Solana track (main hackathon)

**One-liner**: The TradingView for on-chain prediction markets, starting with Panta on Solana.

**Pitch** (long form):
> Prediction markets are breaking out (Polymarket/Kalshi volumes at records), and Solana's permissionless venue Panta just opened an API. But every consumer faces the same gaps: no price history, no real-time feed, no trader analytics. Panta Terminal is the data layer: a Rust ingestion core that snapshots the full catalog twice a minute, aggregates OHLC candles, persists trade tapes the venue itself discards, ranks wallets by realized PnL, and pushes it all over WebSocket — with non-custodial trading built in. The same core generalizes to every venue that exposes markets but not market data.

**Why Solana**: sub-second finality + sub-cent fees make 30-second-resolution market data and per-tick position updates economically viable; Panta is Solana-native.

**Business model**: free terminal → paid alerts/API access for the historical data only we have; fee-sharing on attributed volume.

**Deck**: see PITCH.md (10 slides).

**Demo video / repo / live URL**: (fill after deploy)
