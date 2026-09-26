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
    <main className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-4 flex items-center gap-2 text-xs text-mute">
        <a href="/" className="transition-colors hover:text-ink">
          ← Radar
        </a>
        <span className="text-faint">·</span>
        <span
          className={`tnum inline-flex items-center gap-1.5 ${
            connected ? "text-yes" : "text-faint"
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              connected ? "bg-yes animate-pulse" : "bg-faint"
            }`}
          />
          {connected ? "live" : "offline"}
        </span>
      </div>

      {/* header: title + big odds, Polymarket-style */}
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <span className="text-[11px] font-medium tracking-[0.08em] text-faint uppercase">
            {detail?.category ?? "market"} · {detail?.status ?? detail?.phase ?? "—"}
          </span>
          <h1 className="mt-1 font-display text-3xl font-semibold leading-snug tracking-tight">
            {title}
          </h1>
        </div>
        <div className="text-right">
          <div className="tnum font-display text-4xl font-semibold text-yes">
            {fmtPct(typeof yesPrice === "string" ? Number(yesPrice) : yesPrice)}
          </div>
          <div className="text-xs text-faint">YES probability</div>
        </div>
      </div>

      {/* stats strip */}
      <dl className="mb-6 flex flex-wrap gap-x-8 gap-y-2 border-y border-line py-3 text-sm">
        <Stat k="Volume" v={fmtUsd(Number(detail?.volumeUsdc ?? NaN) || null)} />
        <Stat k="Ends" v={fmtTime(detail?.endTime)} />
        <Stat k="Resolution" v={fmtTime(detail?.resolutionTime)} />
        <Stat
          k="Source"
          v=""
          link={`https://panta.market/market/${id}`}
          linkText="panta.market ↗"
        />
      </dl>

      {error && <p className="mb-4 text-no">Detail error: {error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* left column: chart, rules, tape */}
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                YES price history{" "}
                <span className="text-xs font-normal text-accent-deep">
                  (captured by Panta Terminal — not available on panta.market)
                </span>
              </h2>
              <div className="flex gap-1 rounded-full border border-line bg-cream p-0.5 text-xs">
                {INTERVALS.map((i) => (
                  <button
                    key={i.secs}
                    onClick={() => setIntervalSecs(i.secs)}
                    className={`rounded-full px-2.5 py-0.5 transition-colors duration-200 ${
                      interval === i.secs
                        ? "bg-accent-soft text-accent-deep font-medium"
                        : "text-mute hover:text-ink"
                    }`}
                  >
                    {i.label}
                  </button>
                ))}
              </div>
            </div>
            <CandleChart candles={candles} livePrice={livePrice} />
          </section>

          {detail?.resolutionRule && (
            <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
              <h2 className="mb-2 text-sm font-semibold">Resolution rules</h2>
              <p className="text-sm leading-relaxed text-mute">
                {detail.resolutionRule}
              </p>
            </section>
          )}

          <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
            <h2 className="mb-3 text-sm font-semibold">Recent tape</h2>
            <div className="max-h-72 space-y-1.5 overflow-y-auto text-xs">
              {trades.length === 0 && (
                <p className="text-mute">No trades captured yet.</p>
              )}
              {trades.map((t, i) => (
                <div
                  key={t.signature ?? i}
                  className="flex justify-between gap-2"
                >
                  <span
                    className={`font-semibold ${
                      t.side === "yes" ? "text-yes" : "text-no"
                    }`}
                  >
                    {(t.side ?? "?").toUpperCase()}
                  </span>
                  <span className="font-mono text-[11px] text-mute">
                    {t.wallet ? shortWallet(t.wallet) : "—"}
                  </span>
                  <span className="tnum text-mute">
                    {t.shares ? `${Number(t.shares).toFixed(2)} sh` : ""}
                  </span>
                  <span className="tnum text-faint">
                    {t.blockTime
                      ? new Date(t.blockTime * 1000).toLocaleTimeString()
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* right column: trade ticket + facts */}
        <aside className="space-y-4">
          <BuyPanel
            marketId={id}
            yesPrice={
              typeof yesPrice === "string" ? Number(yesPrice) : yesPrice
            }
          />
          <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
            <h2 className="mb-3 text-sm font-semibold">Market</h2>
            <dl className="space-y-2 text-xs">
              <Row k="Category" v={detail?.category ?? "—"} />
              <Row k="Status" v={detail?.status ?? detail?.phase ?? "—"} />
              <Row
                k="Volume"
                v={fmtUsd(Number(detail?.volumeUsdc ?? NaN) || null)}
              />
              <Row k="Ends" v={fmtTime(detail?.endTime)} />
              <Row k="Resolution" v={fmtTime(detail?.resolutionTime)} />
            </dl>
            <a
              href={`https://panta.market/market/${id}`}
              target="_blank"
              className="mt-3 inline-block text-xs text-accent-deep hover:underline"
            >
              View on panta.market ↗
            </a>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Stat({
  k,
  v,
  link,
  linkText,
}: {
  k: string;
  v: string;
  link?: string;
  linkText?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-xs text-faint">{k}</dt>
      <dd className="tnum font-medium">
        {link ? (
          <a href={link} target="_blank" className="text-accent-deep hover:underline">
            {linkText}
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-mute">{k}</dt>
      <dd className="tnum text-ink">{v}</dd>
    </div>
  );
}
