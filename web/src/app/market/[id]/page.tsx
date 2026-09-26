"use client";

import { use, useEffect, useState } from "react";
import {
  fetchCandles,
  fetchMarketDetail,
  fetchTrades,
  fmtPct,
  fmtTime,
  fmtUsd,
  shortWallet,
  useLiveEvents,
} from "@/lib/api";
import CandleChart from "./CandleChart";
import BuyPanel from "./BuyPanel";

const INTERVALS = [
  { label: "1m", secs: 60 },
  { label: "5m", secs: 300 },
  { label: "1h", secs: 3600 },
  { label: "1d", secs: 86400 },
];

export default function MarketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [detail, setDetail] = useState<any>(null);
  const [candles, setCandles] = useState<any[]>([]);
  const [trades, setTrades] = useState<any[]>([]);
  const [interval, setIntervalSecs] = useState(300);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMarketDetail(id).then(setDetail).catch((e) => setError(e.message));
    fetchTrades(id).then(setTrades).catch(() => {});
  }, [id]);

  useEffect(() => {
    fetchCandles(id, interval).then(setCandles).catch(() => setCandles([]));
  }, [id, interval]);

  const connected = useLiveEvents((e) => {
    if (e.type === "price" && e.marketId === id) setLivePrice(e.yesPrice);
    if (e.type === "trade" && e.marketId === id) {
      setTrades((prev) =>
        [
          {
            wallet: e.wallet,
            side: e.side,
            blockTime: e.ts,
            shares: e.amountUsdc?.toString(),
          },
          ...prev,
        ].slice(0, 100),
      );
    }
  });

  const yesPrice =
    livePrice ??
    (candles.length ? candles[candles.length - 1].close : null) ??
    detail?.yesPrice;
  const title = detail?.question || detail?.title || id;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 text-xs text-zinc-500">
        <a href="/" className="hover:text-zinc-300">← Radar</a>
        <span className="mx-2">·</span>
        <span className={connected ? "text-emerald-400" : ""}>
          {connected ? "● live" : "○ offline"}
        </span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <h1 className="text-xl font-bold max-w-3xl leading-snug">{title}</h1>
        <div className="text-right">
          <div className="text-3xl font-bold text-emerald-400">
            {fmtPct(typeof yesPrice === "string" ? Number(yesPrice) : yesPrice)}
          </div>
          <div className="text-xs text-zinc-500">YES probability</div>
        </div>
      </div>

      {error && <p className="text-red-400 mb-4">Detail error: {error}</p>}

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-zinc-300">
              YES price history <span className="text-emerald-500 text-xs">(captured by Panta Terminal — not available on panta.market)</span>
            </h2>
            <div className="flex gap-1.5 text-xs">
              {INTERVALS.map((i) => (
                <button
                  key={i.secs}
                  onClick={() => setIntervalSecs(i.secs)}
                  className={`px-2 py-1 rounded border ${
                    interval === i.secs
                      ? "border-emerald-600 text-emerald-400"
                      : "border-zinc-800 text-zinc-400 hover:border-zinc-600"
                  }`}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>
          <CandleChart candles={candles} livePrice={livePrice} />
        </section>

        <aside className="space-y-4">
          <BuyPanel marketId={id} />
          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">Market</h2>
            <dl className="text-xs space-y-2">
              <Row k="Category" v={detail?.category ?? "—"} />
              <Row k="Status" v={detail?.status ?? detail?.phase ?? "—"} />
              <Row k="Volume" v={fmtUsd(Number(detail?.volumeUsdc ?? NaN) || null)} />
              <Row k="Ends" v={fmtTime(detail?.endTime)} />
              <Row k="Resolution" v={fmtTime(detail?.resolutionTime)} />
            </dl>
            {detail?.resolutionRule && (
              <p className="mt-3 text-xs text-zinc-500 leading-relaxed border-t border-zinc-800 pt-3">
                {detail.resolutionRule}
              </p>
            )}
            <a
              href={`https://panta.market/market/${id}`}
              target="_blank"
              className="mt-3 inline-block text-xs text-emerald-400 hover:underline"
            >
              View on panta.market ↗
            </a>
          </section>

          <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-sm font-semibold text-zinc-300 mb-3">
              Recent tape
            </h2>
            <div className="space-y-1.5 max-h-80 overflow-y-auto text-xs">
              {trades.length === 0 && (
                <p className="text-zinc-500">No trades captured yet.</p>
              )}
              {trades.map((t, i) => (
                <div key={t.signature ?? i} className="flex justify-between gap-2">
                  <span
                    className={
                      t.side === "yes" ? "text-emerald-400" : "text-rose-400"
                    }
                  >
                    {(t.side ?? "?").toUpperCase()}
                  </span>
                  <span className="text-zinc-400 font-mono">
                    {t.wallet ? shortWallet(t.wallet) : "—"}
                  </span>
                  <span className="text-zinc-500">
                    {t.shares ? `${Number(t.shares).toFixed(2)} sh` : ""}
                  </span>
                  <span className="text-zinc-600">
                    {t.blockTime
                      ? new Date(t.blockTime * 1000).toLocaleTimeString()
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-zinc-500">{k}</dt>
      <dd className="text-zinc-200">{v}</dd>
    </div>
  );
}
