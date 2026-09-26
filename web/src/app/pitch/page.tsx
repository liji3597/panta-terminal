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
        .then((h) => setStats((s) => (s ? { ...s, snapshots: h.snapshots ?? s.snapshots } : s)))
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const next = useCallback(
    () => setSlide((s) => Math.min(s + 1, SLIDES - 1)),
    [],
  );
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
      className="h-[calc(100vh-3rem)] flex flex-col items-center justify-center px-8 select-none cursor-pointer"
      onClick={next}
    >
      <div className="max-w-4xl w-full">{renderSlide(slide, stats)}</div>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
        {Array.from({ length: SLIDES }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === slide ? "w-6 bg-emerald-400" : "w-1.5 bg-zinc-700"
            }`}
          />
        ))}
      </div>
      <p className="fixed bottom-6 right-6 text-xs text-zinc-600">
        ← → navigate · click to advance
      </p>
    </main>
  );
}

const SLIDES = 6;

function Counter({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="text-center">
      <div className="text-4xl font-bold text-emerald-400 tabular-nums">
        {value === undefined ? "…" : value.toLocaleString()}
      </div>
      <div className="text-xs text-zinc-500 mt-1 uppercase tracking-wide">{label}</div>
    </div>
  );
}

function renderSlide(s: number, stats: Stats | null) {
  switch (s) {
    case 0:
      return (
        <div className="text-center space-y-6">
          <p className="text-zinc-500 uppercase tracking-widest text-sm">
            Colosseum Crypto World's Fair 2026 · Solana
          </p>
          <h1 className="text-5xl font-bold">
            Panta<span className="text-emerald-400">Terminal</span>
          </h1>
          <p className="text-xl text-zinc-400">
            The TradingView for on-chain prediction markets.
          </p>
          <p className="text-sm text-zinc-600">Built on the Panta API · Solana</p>
        </div>
      );
    case 1:
      return (
        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-rose-400">The problem</h2>
          <ul className="text-xl text-zinc-300 space-y-4 list-none">
            <li>▸ Panta opened a permissionless prediction-market API on Solana — but exposes <b>no price history</b>.</li>
            <li>▸ No websockets, no push: every consumer must poll, and every trader flies blind.</li>
            <li>▸ Trade tapes are rotated out; trader analytics are impossible without your own capture layer.</li>
          </ul>
        </div>
      );
    case 2:
      return (
        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-emerald-400">The product — running right now</h2>
          <div className="grid grid-cols-4 gap-6 py-6">
            <Counter label="markets tracked" value={stats?.markets} />
            <Counter label="price snapshots" value={stats?.snapshots} />
            <Counter label="wallets ranked" value={stats?.wallets} />
            <Counter label="markets titled" value={stats?.titled} />
          </div>
          <p className="text-zinc-400 text-lg">
            These numbers tick up live — a Rust core snapshots the full Panta catalog every 30 seconds and
            serves OHLC charts, a WebSocket firehose, and a smart-money leaderboard.
          </p>
        </div>
      );
    case 3:
      return (
        <div className="space-y-6">
          <h2 className="text-3xl font-bold">How it works</h2>
          <pre className="text-sm md:text-base text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-xl p-6 leading-relaxed overflow-x-auto">
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
          <p className="text-zinc-500">API key server-side only. User funds never touch our backend.</p>
        </div>
      );
    case 4:
      return (
        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-emerald-400">Why we win</h2>
          <ul className="text-xl text-zinc-300 space-y-4 list-none">
            <li>▸ <b>Only</b> price history in the Panta ecosystem — the chart literally says so.</li>
            <li>▸ We keep the tape Panta discards: proprietary dataset growing minute by minute.</li>
            <li>▸ Infra, not a reskin: the same core generalizes to every venue with markets but no market data.</li>
            <li>▸ Model: free terminal → paid alerts & history API → attributed-volume fee share.</li>
          </ul>
        </div>
      );
    default:
      return (
        <div className="text-center space-y-6">
          <h2 className="text-3xl font-bold">Roadmap</h2>
          <p className="text-xl text-zinc-300">
            Alerts → public history API → multi-venue adapters → creator analytics
          </p>
          <div className="pt-6 space-y-2 text-zinc-400">
            <p className="text-2xl font-bold text-emerald-400">Try it live — links in the README</p>
            <p className="text-sm">Radar · Smart Money · Portfolio · Sandbox trading (?sandbox=1)</p>
          </div>
        </div>
      );
  }
}
