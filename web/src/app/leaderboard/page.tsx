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
    <main className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-xl font-bold">Smart Money</h1>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${
            connected
              ? "border-emerald-700 text-emerald-400"
              : "border-zinc-700 text-zinc-500"
          }`}
        >
          {connected ? "● live" : "○ offline"}
        </span>
        <p className="text-xs text-zinc-500 ml-auto">
          Aggregated from Panta trade tapes we ingest; realized PnL covers
          resolved markets only.
        </p>
      </div>

      {loading && <p className="text-zinc-500">Loading…</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      <div className="rounded-xl border border-zinc-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-xs text-zinc-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3">#</th>
              <th className="text-left px-4 py-3">Wallet</th>
              <th className="text-right px-4 py-3">Volume</th>
              <th className="text-right px-4 py-3">Trades</th>
              <th className="text-right px-4 py-3">Markets</th>
              <th className="text-right px-4 py-3">Realized PnL</th>
              <th className="text-right px-4 py-3">W / L</th>
              <th className="text-right px-4 py-3">Last active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w, i) => (
              <tr
                key={w.wallet}
                className="border-t border-zinc-800 hover:bg-zinc-900/60"
              >
                <td className="px-4 py-2.5 text-zinc-500">{i + 1}</td>
                <td className="px-4 py-2.5 font-mono">
                  <a
                    href={`https://solscan.io/account/${w.wallet}`}
                    target="_blank"
                    className="text-emerald-400 hover:underline"
                  >
                    {shortWallet(w.wallet)}
                  </a>
                </td>
                <td className="px-4 py-2.5 text-right">{fmtUsd(w.volumeUsdc)}</td>
                <td className="px-4 py-2.5 text-right text-zinc-400">{w.trades}</td>
                <td className="px-4 py-2.5 text-right text-zinc-400">
                  {w.marketsTouched}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-medium ${
                    (w.realizedPnl ?? 0) > 0
                      ? "text-emerald-400"
                      : (w.realizedPnl ?? 0) < 0
                        ? "text-rose-400"
                        : "text-zinc-400"
                  }`}
                >
                  {w.realizedPnl === null ? "—" : fmtUsd(w.realizedPnl)}
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-400">
                  {w.wins} / {w.losses}
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-500 text-xs">
                  {fmtTime(w.lastActive)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && rows.length === 0 && (
          <p className="px-4 py-8 text-center text-zinc-500 text-sm">
            No wallets yet — the tape collector fills this in as it sweeps
            active markets.
          </p>
        )}
      </div>
    </main>
  );
}
