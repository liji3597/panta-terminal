# Demo Video Script — Panta Terminal (≤ 3 min)

Record in **sandbox mode** (`?sandbox=1`): the full trade flow runs against Panta test fixtures, zero funds needed. English voiceover, screen capture 1080p.

## Shot list

**0:00–0:15 — Hook (radar page)**
> "Panta lets anyone create and trade prediction markets on Solana. But it has no price history, no charts, no real-time feed. Panta Terminal fixes that."

Show the radar: 100+ markets, category chips, live badge. Let a `price` event flash a card live.

**0:15–0:45 — The gap we fill (market page, K-line)**
> "Every price you see here is captured by our Rust backend every 30 seconds — the first price history in the Panta ecosystem. Panta's API has no history endpoint and no websockets; we built both."

Switch intervals 1m/5m/1h. Point at the label "captured by Panta Terminal — not available on panta.market".

**0:45–1:15 — Live data (radar + tape)**
> "Odds move pushed over our WebSocket the moment they change. The tape on the right streams trades as they happen — and we keep the history Panta discards."

**1:15–2:00 — Trade non-custodially (market page, BuyPanel)**
> "Trading never leaves the Panta protocol. Quote, build, sign in my wallet, broadcast, verify — five steps, and Panta Terminal never touches user funds."

Connect Phantom → pick YES → $5 → quote preview (shares + fee) → confirm → signature → order status confirmed. Mention sandbox banner.

**2:00–2:25 — Smart money + portfolio**
> "A leaderboard of every wallet we've seen on the tape — volume, realized PnL on resolved markets. And your own positions, with one-click claims."

Show /leaderboard, then /portfolio with a claim.

**2:25–3:00 — Close (architecture + ask)**
> "Rust ingestion core, Next.js terminal, fully non-custodial on the Panta API. Panta Terminal is the market-data layer this ecosystem is missing — and it's live today."

End card: URL + GitHub + "Built on the Panta API · Colosseum Crypto World's Fair 2026".

## Recording checklist

- [ ] Backend running ≥ 30 min beforehand so charts have history
- [ ] `?sandbox=1` in URL; Phantom connected (any wallet, zero balance OK)
- [ ] Pick a sports market with actual title + volume for the trade shot
- [ ] Hide bookmarks bar, 125% zoom, dark theme throughout
