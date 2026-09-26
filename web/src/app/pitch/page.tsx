"use client";

import { useCallback, useEffect, useState } from "react";
import { API, fetchLeaderboard, fetchRadar } from "@/lib/api";

type Stats = {
  markets: number;
  snapshots: number;
  wallets: number;
  titled: number;
};

export default function PitchPage() {
  const [slide, setSlide] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    Promise.all([
      fetchRadar(),
      fetch(`${API}/api/health`).then((r) => r.json()),
      fetchLeaderboard(200),
    ])
      .then(([radar, health, lb]) =>
        setStats({
          markets: radar.count,
          snapshots: health.snapshots ?? 0,
          wallets: lb.length,
          titled: radar.items.filter((m) => m.title).length,
        }),
      )
      .catch(() => {});
    const t = setInterval(() => {
      fetch(`${API}/api/health`)
        .then((r) => r.json())
        .then((h) =>
          setStats((s) =>
            s ? { ...s, snapshots: h.snapshots ?? s.snapshots } : s,
          ),
        )
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const next = useCallback(() => setSlide((s) => Math.min(s + 1, SLIDES - 1)), []);
  const prev = useCallback(() => setSlide((s) => Math.max(s - 1, 0)), []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [next, prev]);

  return (
    <main
      className="flex h-[calc(100vh-3.5rem)] cursor-pointer flex-col items-center justify-center px-8 select-none"
      onClick={next}
    >
      <div className="w-full max-w-4xl">{renderSlide(slide, stats)}</div>
      <div className="fixed bottom-6 left-1/2 flex -translate-x-1/2 gap-1.5">
        {Array.from({ length: SLIDES }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === slide ? "w-6 bg-accent" : "w-1.5 bg-line-strong"
            }`}
          />
        ))}
      </div>
      <p className="fixed right-6 bottom-6 text-xs text-faint">
        ← → navigate · click to advance
      </p>
    </main>
  );
}

const SLIDES = 6;

function Counter({
  label,
  value,
}: {
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="text-center">
      <div className="tnum font-display text-5xl font-semibold text-accent-deep">
        {value === undefined ? "…" : value.toLocaleString()}
      </div>
      <div className="mt-2 text-[11px] font-medium tracking-[0.08em] text-mute uppercase">
        {label}
      </div>
    </div>
  );
}

function renderSlide(s: number, stats: Stats | null) {
  switch (s) {
    case 0:
      return (
        <div className="space-y-6 text-center">
          <p className="text-xs font-medium tracking-[0.2em] text-faint uppercase">
            Colosseum Crypto World's Fair 2026 · Solana
          </p>
          <h1 className="font-display text-6xl font-semibold tracking-tight">
            Panta<span className="text-accent italic">Terminal</span>
          </h1>
          <p className="font-display text-2xl text-mute italic">
            The TradingView for on-chain prediction markets.
          </p>
          <p className="text-sm text-faint">Built on the Panta API · Solana</p>
        </div>
      );
    case 1:
      return (
        <div className="space-y-8">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-no">
            The problem
          </h2>
          <ul className="list-none space-y-5 text-xl leading-relaxed text-ink">
            <li>
              <span className="mr-2 text-accent">▸</span>Panta opened a
              permissionless prediction-market API on Solana — but exposes{" "}
              <b>no price history</b>.
            </li>
            <li>
              <span className="mr-2 text-accent">▸</span>No websockets, no push:
              every consumer must poll, and every trader flies blind.
            </li>
            <li>
              <span className="mr-2 text-accent">▸</span>Trade tapes are rotated
              out; trader analytics are impossible without your own capture
              layer.
            </li>
          </ul>
        </div>
      );
    case 2:
      return (
        <div className="space-y-8">
          <h2 className="font-display text-4xl font-semibold tracking-tight">
            The product —{" "}
            <span className="text-yes italic">running right now</span>
          </h2>
          <div className="grid grid-cols-4 gap-6 rounded-2xl border border-line bg-card py-10 shadow-card">
            <Counter label="markets tracked" value={stats?.markets} />
            <Counter label="price snapshots" value={stats?.snapshots} />
            <Counter label="wallets ranked" value={stats?.wallets} />
            <Counter label="markets titled" value={stats?.titled} />
          </div>
          <p className="text-lg leading-relaxed text-mute">
            These numbers tick up live — a Rust core snapshots the full Panta
            catalog every 30 seconds and serves OHLC charts, a WebSocket
            firehose, and a smart-money leaderboard.
          </p>
        </div>
      );
    case 3:
      return (
        <div className="space-y-8">
          <h2 className="font-display text-4xl font-semibold tracking-tight">
            How it works
          </h2>
          <pre className="overflow-x-auto rounded-2xl border border-line bg-card p-6 font-mono text-sm leading-relaxed text-ink shadow-card md:text-base">
{`Panta API ──► Rust core (axum · tokio · SQLite)
                 30 s fan-out snapshotter
                 OHLC aggregation · tape persistence
                        │
                 WebSocket push ──► Next.js terminal
                 radar · charts · smart money
                        │
                 non-custodial trading
                 quote → build → wallet signs → verify`}
          </pre>
          <p className="text-mute">
            API key server-side only. User funds never touch our backend.
          </p>
        </div>
      );
    case 4:
      return (
        <div className="space-y-8">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-yes">
            Why we win
          </h2>
          <ul className="list-none space-y-5 text-xl leading-relaxed text-ink">
            <li>
              <span className="mr-2 text-accent">▸</span>
              <b>Only</b> price history in the Panta ecosystem — the chart
              literally says so.
            </li>
            <li>
              <span className="mr-2 text-accent">▸</span>We keep the tape Panta
              discards: proprietary dataset growing minute by minute.
            </li>
            <li>
              <span className="mr-2 text-accent">▸</span>Infra, not a reskin:
              the same core generalizes to every venue with markets but no
              market data.
            </li>
            <li>
              <span className="mr-2 text-accent">▸</span>Model: free terminal →
              paid alerts & history API → attributed-volume fee share.
            </li>
          </ul>
        </div>
      );
    default:
      return (
        <div className="space-y-8 text-center">
          <h2 className="font-display text-4xl font-semibold tracking-tight">
            Roadmap
          </h2>
          <p className="text-xl leading-relaxed text-ink">
            Alerts → public history API → multi-venue adapters → creator
            analytics
          </p>
          <div className="space-y-3 pt-6">
            <p className="font-display text-3xl font-semibold text-accent-deep italic">
              Try it live — links in the README
            </p>
            <p className="text-sm text-mute">
              Radar · Smart Money · Portfolio · Sandbox trading (?sandbox=1)
            </p>
          </div>
        </div>
      );
  }
}
