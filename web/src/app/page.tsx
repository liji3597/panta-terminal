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

const sortLabels: Record<SortKey, string> = {
  volume: "Volume",
  yesPrice: "YES %",
  recent: "Recent",
};

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
    const list = markets.filter(
      (m) => category === "all" || (m.category ?? "other") === category,
    );
    // sports first inside every sort — that's where Panta's liquidity lives
    const sportsBoost = (m: RadarMarket) => (m.category === "sports" ? 1 : 0);
    switch (sortKey) {
      case "volume":
        list.sort(
          (a, b) =>
            sportsBoost(b) - sportsBoost(a) ||
            (b.volumeUsdc ?? 0) - (a.volumeUsdc ?? 0),
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
    <main className="mx-auto max-w-7xl px-4 py-10">
      {/* header row */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight">
          Market Radar
        </h1>
        <span
          className={`tnum mb-1.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${
            connected
              ? "border-yes/30 bg-yes-soft text-yes"
              : "border-line bg-parchment text-mute"
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              connected ? "bg-yes animate-pulse" : "bg-faint"
            }`}
          />
          {connected ? "live" : "offline"}
        </span>
        {lastTick && (
          <span className="tnum mb-1.5 text-xs text-faint">
            last snapshot {new Date(lastTick * 1000).toLocaleTimeString()}
          </span>
        )}
        <div className="ml-auto flex gap-1 rounded-full border border-line bg-card p-1 text-xs shadow-card">
          {(Object.keys(sortLabels) as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSortKey(k)}
              className={`rounded-full px-3 py-1 transition-colors duration-200 ${
                sortKey === k
                  ? "bg-accent-soft text-accent-deep font-medium"
                  : "text-mute hover:text-ink"
              }`}
            >
              {sortLabels[k]}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-8 max-w-xl text-sm leading-relaxed text-mute">
        Every Panta prediction market, scanned and ranked in real time — odds,
        liquidity and momentum in one glance.
      </p>

      {/* category filter */}
      <div className="mb-8 flex flex-wrap gap-2 text-xs">
        <CategoryPill
          active={category === "all"}
          onClick={() => setCategory("all")}
          label={`all · ${markets.length}`}
        />
        {categories.map(([c, n]) => (
          <CategoryPill
            key={c}
            active={category === c}
            onClick={() => setCategory(c)}
            label={`${c} · ${n}`}
          />
        ))}
      </div>

      {loading && (
        <p className="font-display text-lg italic text-faint">
          Scanning the markets…
        </p>
      )}
      {error && (
        <p className="text-no">
          Backend unreachable ({error}) — is <code>{API}</code> running?
        </p>
      )}

      {/* market grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((m) => (
          <Link
            key={m.marketId}
            href={`/market/${m.marketId}`}
            className="group rounded-2xl border border-line bg-card p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift"
          >
            <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-[0.08em]">
              <span className="text-faint">{m.category ?? "?"}</span>
              <StatusBadge status={m.status} phase={m.phase} />
            </div>
            <p className="mt-3 min-h-12 font-display text-[17px] leading-snug font-medium line-clamp-2 transition-colors duration-200 group-hover:text-accent-deep">
              {m.title || `${m.marketId.slice(0, 16)}…`}
            </p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <OddsBar yes={m.yesPrice} />
              <span className="tnum shrink-0 text-xs text-mute">
                {fmtUsd(m.volumeUsdc)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}

function CategoryPill({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`tnum rounded-full border px-3 py-1 transition-colors duration-200 ${
        active
          ? "border-accent/40 bg-accent-soft text-accent-deep font-medium"
          : "border-line bg-card text-mute hover:border-line-strong hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({
  status,
  phase,
}: {
  status: string | null;
  phase: string | null;
}) {
  const s = status ?? phase ?? "?";
  const live = (status ?? "").includes("active");
  return (
    <span
      className={`rounded-full px-2 py-0.5 ${
        live ? "bg-yes-soft text-yes" : "bg-parchment text-mute"
      }`}
    >
      {s}
    </span>
  );
}

function OddsBar({ yes }: { yes: number | null }) {
  const pct = yes === null ? null : Math.round(yes * 100);
  return (
    <div className="flex-1">
      <div className="tnum mb-1.5 flex justify-between text-xs">
        <span className="font-semibold text-yes">YES {fmtPct(yes)}</span>
        <span className="text-no">
          NO {pct === null ? "—" : `${100 - pct}%`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-no-soft">
        <div
          className="h-full rounded-full bg-yes transition-all duration-500"
          style={{ width: `${pct ?? 0}%` }}
        />
      </div>
    </div>
  );
}
