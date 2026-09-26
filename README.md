# Panta Terminal

The TradingView for Panta prediction markets on Solana — live radar, the ecosystem's first price-history charts, WebSocket push, smart-money leaderboard, and one-click non-custodial trading, all on the Panta API.

Built for Colosseum Crypto World's Fair 2026 (Solana track) + the Panta API sidetrack.

## Repo layout

```
crates/panta-client   Typed async Rust client for the Panta API (rate-limited, retrying)
crates/server         axum backend: radar proxy now; snapshotter/OHLC/WS in P2
web/                  Next.js 15 + TS + Tailwind frontend
docs/PLAN.md          Full product plan & 16-day schedule (Chinese)
.env                  Secrets — NEVER commit (gitignored)
```

## Run

Prereqs: Rust toolchain, Node 20+, a `.env` with `PANTA_API_KEY` / `PANTA_TEST_API_KEY` (see docs.panta.market → Quickstart).

```bash
# backend — http://localhost:8080
cargo run -p panta-terminal-server

# frontend — http://localhost:3000
cd web && npm install && npm run dev
```

Backend routes:
- `GET /api/health` — service + snapshot count
- `GET /api/markets` — radar from our snapshot store (fast); `?source=live` fans out over the Panta API
- `GET /api/markets/{id}` — detail, cached (titles don't ship in list rows)
- `GET /api/markets/{id}/trades` — live tape, opportunistically persisted
- `GET /api/markets/{id}/candles?interval=60|300|900|1800|3600|86400` — OHLC from our own snapshots
- `GET /api/leaderboard?limit=50` — smart-money stats from the collected tape (volume, realized PnL on resolved markets, W/L)
- `POST /api/trade/quote` `/api/trade/build` `/api/trade/submit` `/api/trade/verify` — non-custodial buy flow proxy (server holds the API key; the wallet signs in the browser)
- `GET /api/positions?wallet=` and `POST /api/claim/build` — holdings and win-claim transactions
- `GET /ws` — WebSocket fan-out: `tick` / `price` / `trade` events every 30 s

A background snapshotter (30 s tick) fans out over status × category, records price snapshots for every market, drips detail fetches for missing titles, and pulls trade tapes for the top-volume active markets — all inside Panta's rate budget.

All routes accept `?env=test` where a Panta call is involved, for the sandbox.

## Panta API notes (learned the hard way)

- List cursor pagination loops — full coverage needs status × category fan-out.
- Prices arrive both as `"0.43"` and 1e9-scaled strings; normalize via `norm_price`.
- Reads are rate-limited to ~120/60s; the client self-throttles at 100.
- The trade tape uses `blockTime` (not `timestamp`), `amountUsdc` is often null on primary buys — derive amounts from `yesAmount`/`noAmount` base units and price from amount ÷ shares.
- List rows ship with empty titles; display names need the detail endpoint (the snapshotter backfills them into the store).
- The catalog contains categories beyond the documented nine (e.g. stocks, commodities).

License: MIT.
