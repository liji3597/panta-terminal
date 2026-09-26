# Deploy Guide — Panta Terminal

Two moving parts: Rust backend (Render) + Next.js frontend (Vercel). ~20 minutes total.

## 0. Push to GitHub first

```bash
cd D:\Superteam\panta-api-side-track
git init
git add -A
git commit -m "Panta Terminal: radar, OHLC history, WS push, smart money, non-custodial trading"
# create repo at github.com/new (name: panta-terminal, can be private while competing)
git remote add origin git@github.com:<you>/panta-terminal.git
git push -u origin main
```

`.env` and `panta-terminal.db` are gitignored — secrets stay local.

## 1. Backend → Render (free)

1. render.com → New → Blueprint → connect the repo (it reads `render.yaml` automatically).
2. Set the two env secrets when prompted: `PANTA_API_KEY`, `PANTA_TEST_API_KEY` (values are in your local `.env`).
3. Deploy. Note the URL, e.g. `https://panta-terminal-api.onrender.com`.
4. Verify: `curl https://<your>.onrender.com/api/health` → `{"status":"ok", …}`.

The attached 1 GB disk keeps SQLite (all accumulated price history) across deploys. Free plan sleeps when idle — first request after sleep takes ~30 s; the snapshotter keeps it warm enough during the judging window. Consider a $7 starter plan during judging to avoid cold starts.

## 2. Frontend → Vercel (free)

1. vercel.com → Add New → Project → import the repo.
2. Root directory: `web`.
3. Env var: `NEXT_PUBLIC_API_URL=https://<your>.onrender.com` (and optionally `NEXT_PUBLIC_SOLANA_RPC` for a faster RPC).
4. Deploy. Radar should load live data within seconds.

## 3. Post-deploy checks

- [ ] Radar shows markets with titles and YES/NO bars
- [ ] A market page shows candles (give the backend 5–10 min to accumulate fresh snapshots after first boot)
- [ ] `?sandbox=1` → connect Phantom → buy $1 YES on an open market → status `confirmed`
- [ ] `/leaderboard` has rows (grows as the tape collector sweeps)
- [ ] WebSocket badge shows ● live

## 4. Submit

- Panta sidetrack + Colosseum main track, using docs/SUBMISSION.md text.
- Record the demo video per docs/DEMO_SCRIPT.md against the deployed URL (sandbox mode).
- Post on X tagging @PantaHQ and @colosseum with the demo link.
