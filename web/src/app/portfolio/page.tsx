"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { API, fmtUsd } from "@/lib/api";
import { compileTx } from "@/lib/tx";

type Position = {
  marketId?: string;
  yesShares?: string;
  noShares?: string;
  shares?: string;
  phase?: string;
  claimable?: boolean;
  yesWins?: boolean;
  [k: string]: unknown;
};

export default function PortfolioPage() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    if (!publicKey) return;
    fetch(`${API}/api/positions?wallet=${publicKey.toBase58()}`)
      .then((r) => r.json())
      .then((d) => setPositions(d.positions ?? d.items ?? []))
      .catch((e) => setError(e.message));
  }, [publicKey]);

  useEffect(load, [load]);

  async function claim(p: Position) {
    if (!publicKey || !signTransaction || !p.marketId) return;
    const mid = p.marketId;
    setClaiming(mid);
    try {
      const r = await fetch(`${API}/api/claim/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey.toBase58(), marketId: mid }),
      });
      const build = await r.json();
      if (!r.ok) throw new Error(build.error ?? `HTTP ${r.status}`);

      let signature: string;
      if (!build.instructions?.length) {
        signature = build.signature ?? bs58.encode(Buffer.alloc(64, 2));
      } else {
        const tx = compileTx(build, publicKey);
        const signed = await signTransaction(tx);
        signature = await connection.sendRawTransaction(signed.serialize());
      }
      await fetch(`${API}/api/trade/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature, kind: "claim" }),
      });
      setClaimed((prev) => ({ ...prev, [mid]: signature }));
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setClaiming(null);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-xl font-bold mb-6">Portfolio</h1>

      {!connected && (
        <p className="text-zinc-500">Connect your wallet (top right) to see positions.</p>
      )}
      {error && <p className="text-rose-400 mb-4">{error}</p>}
      {connected && positions && positions.length === 0 && (
        <p className="text-zinc-500">No positions for this wallet.</p>
      )}

      <div className="space-y-3">
        {(positions ?? []).map((p, i) => (
          <div
            key={p.marketId ?? i}
            className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-wrap items-center gap-4"
          >
            <Link
              href={`/market/${p.marketId}`}
              className="font-mono text-sm text-emerald-400 hover:underline"
            >
              {(p.marketId ?? "").slice(0, 16)}…
            </Link>
            <span className="text-xs text-zinc-500">{p.phase ?? ""}</span>
            <span className="text-sm">
              {String(p.availableShares ?? p.yesShares ?? "0")} shares
              {p.claimedPayoutUsdc ? ` · paid $${p.claimedPayoutUsdc}` : ""}
            </span>
            <span className="ml-auto">
              {claimed[p.marketId ?? ""] ? (
                <span className="text-xs text-emerald-400">
                  claimed ✓ {claimed[p.marketId ?? ""].slice(0, 12)}…
                </span>
              ) : p.claimable ? (
                <button
                  onClick={() => claim(p)}
                  disabled={claiming === p.marketId}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-700 text-xs font-bold"
                >
                  {claiming === p.marketId ? "claiming…" : "Claim winnings"}
                </button>
              ) : (
                <span className="text-xs text-zinc-600">
                  {p.phase === "resolved" ? "not claimable" : "open"}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-6 text-[11px] text-zinc-600">
        Claims are non-custodial: Panta builds the claim instructions, your
        wallet signs, we broadcast and file the signature for attribution.
      </p>
    </main>
  );
}
