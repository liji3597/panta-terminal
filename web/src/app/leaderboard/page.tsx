"use client";

import { useEffect, useState } from "react";
import {
  fetchLeaderboard,
  fmtTime,
  fmtUsd,
  shortWallet,
  useLiveEvents,
  WalletStat,
} from "@/lib/api";

export default function LeaderboardPage() {
  const [rows, setRows] = useState<WalletStat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard()
      .then(setRows)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const connected = useLiveEvents(() => {});

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight">
          Smart Money
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
      </div>
      <p className="mb-8 max-w-xl text-sm leading-relaxed text-mute">
        Aggregated from the Panta trade tapes we ingest. Realized PnL covers
        resolved markets only.
      </p>

      {loading && (
        <p className="font-display text-lg italic text-faint">
          Ranking the wallets…
        </p>
      )}
      {error && <p className="text-no">Error: {error}</p>}

      <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <table className="w-full text-sm">
          <thead className="bg-parchment text-[11px] font-medium uppercase tracking-[0.08em] text-mute">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Wallet</th>
              <th className="px-4 py-3 text-right">Volume</th>
              <th className="px-4 py-3 text-right">Trades</th>
              <th className="px-4 py-3 text-right">Markets</th>
              <th className="px-4 py-3 text-right">Realized PnL</th>
              <th className="px-4 py-3 text-right">W / L</th>
              <th className="px-4 py-3 text-right">Last active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w, i) => (
              <tr
                key={w.wallet}
                className="border-t border-line transition-colors duration-150 hover:bg-cream"
              >
                <td className="tnum px-4 py-2.5 text-faint">{i + 1}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">
                  <a
                    href={`https://solscan.io/account/${w.wallet}`}
                    target="_blank"
                    className="text-accent-deep hover:underline"
                  >
                    {shortWallet(w.wallet)}
                  </a>
                </td>
                <td className="tnum px-4 py-2.5 text-right">
                  {fmtUsd(w.volumeUsdc)}
                </td>
                <td className="tnum px-4 py-2.5 text-right text-mute">
                  {w.trades}
                </td>
                <td className="tnum px-4 py-2.5 text-right text-mute">
                  {w.marketsTouched}
                </td>
                <td
                  className={`tnum px-4 py-2.5 text-right font-medium ${
                    (w.realizedPnl ?? 0) > 0
                      ? "text-yes"
                      : (w.realizedPnl ?? 0) < 0
                        ? "text-no"
                        : "text-mute"
                  }`}
                >
                  {w.realizedPnl === null ? "—" : fmtUsd(w.realizedPnl)}
                </td>
                <td className="tnum px-4 py-2.5 text-right text-mute">
                  {w.wins} / {w.losses}
                </td>
                <td className="tnum px-4 py-2.5 text-right text-xs text-faint">
                  {fmtTime(w.lastActive)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-mute">
            No wallets yet — the tape collector fills this in as it sweeps
            active markets.
          </p>
        )}
      </div>
    </main>
  );
}
