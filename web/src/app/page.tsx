"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  API,
  fetchRadar,
  fmtPct,
  fmtUsd,
  RadarMarket,
  useLiveEvents,
} from "@/lib/api";

type SortKey = "volume" | "yesPrice" | "recent";

export default function RadarPage() {
  const [markets, setMarkets] = useState<RadarMarket[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [lastTick, setLastTick] = useState<number | null>(null);

  useEffect(() => {
    fetchRadar()
      .then((d) => setMarkets(d.items))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const connected = useLiveEvents((e) => {
    if (e.type === "tick") setLastTick(e.ts);
    if (e.type === "price") {
      setMarkets((prev) =>
        prev.map((m) =>
          m.marketId === e.marketId
            ? { ...m, yesPrice: e.yesPrice, volumeUsdc: e.volumeUsdc ?? m.volumeUsdc }
            : m,
        ),
      );
    }
  });

  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    for (const m of markets) {
      const c = m.category ?? "other";
      cats.set(c, (cats.get(c) ?? 0) + 1);
    }
    return [...cats.entries()].sort((a, b) => b[1] - a[1]);
  }, [markets]);

  const visible = useMemo(() => {
    let list = markets.filter((m) => category === "all" || (m.category ?? "other") === category);
    // sports first inside every sort — that's where Panta's liquidity lives
    const sportsBoost = (m: RadarMarket) => (m.category === "sports" ? 1 : 0);
    switch (sortKey) {
      case "volume":
        list.sort(
          (a, b) =>
            sportsBoost(b) - sportsBoost(a) || (b.volumeUsdc ?? 0) - (a.volumeUsdc ?? 0),
        );
        break;
      case "yesPrice":
        list.sort((a, b) => (b.yesPrice ?? -1) - (a.yesPrice ?? -1));
        break;
      case "recent":
        list.sort((a, b) => (b.priceTs ?? 0) - (a.priceTs ?? 0));
        break;
    }
    return list;
  }, [markets, category, sortKey]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">Market Radar</h1>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${
            connected
              ? "border-emerald-700 text-emerald-400"
              : "border-zinc-700 text-zinc-500"
          }`}
        >
          {connected ? "● live" : "○ offline"}
        </span>
        {lastTick && (
          <span className="text-xs text-zinc-500">
            last snapshot {new Date(lastTick * 1000).toLocaleTimeString()}
          </span>
        )}
        <div className="ml-auto flex gap-2 text-xs">
          {(["volume", "yesPrice", "recent"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={`px-2.5 py-1 rounded-md border transition-colors ${
                sortKey === k
                  ? "border-emerald-600 text-emerald-400"
                  : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
              }`}
            >
              {k === "volume" ? "Volume" : k === "yesPrice" ? "YES %" : "Recent"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 text-xs">
        <button
          onClick={() => setCategory("all")}
          className={`px-2.5 py-1 rounded-md border ${
            category === "all"
              ? "border-emerald-600 text-emerald-400"
              : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
          }`}
        >
          all ({markets.length})
        </button>
        {categories.map(([c, n]) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-2.5 py-1 rounded-md border ${
              category === c
                ? "border-emerald-600 text-emerald-400"
                : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
            }`}
          >
            {c} ({n})
          </button>
        ))}
      </div>

      {loading && <p className="text-zinc-500">Loading radar…</p>}
      {error && (
        <p className="text-red-400">
          Backend unreachable ({error}) — is <code>{API}</code> running?
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m) => (
          <Link
            key={m.marketId}
            href={`/market/${m.marketId}`}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 hover:border-emerald-700/60 transition-colors group"
          >
            <div className="flex justify-between text-xs uppercase tracking-wide text-zinc-500">
              <span>{m.category ?? "?"}</span>
              <span
                className={
                  (m.status ?? "").includes("active") ? "text-emerald-400" : ""
                }
              >
                {m.status ?? m.phase ?? "?"}
              </span>
            </div>
            <p className="mt-2 text-sm font-medium line-clamp-2 min-h-10 group-hover:text-emerald-100">
              {m.title || `${m.marketId.slice(0, 16)}…`}
            </p>
            <div className="mt-3 flex items-end justify-between">
              <OddsBar yes={m.yesPrice} />
              <span className="text-xs text-zinc-500">{fmtUsd(m.volumeUsdc)}</span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

function OddsBar({ yes }: { yes: number | null }) {
  const pct = yes === null ? null : Math.round(yes * 100);
  return (
    <div className="flex-1 mr-4">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-emerald-400 font-semibold">YES {fmtPct(yes)}</span>
        <span className="text-rose-400">
          NO {pct === null ? "—" : `${100 - pct}%`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-rose-950 overflow-hidden">
        <div
          className="h-full bg-emerald-500 transition-all duration-500"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}
