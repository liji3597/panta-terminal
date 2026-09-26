"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { useState } from "react";
import { API } from "@/lib/api";
import { compileTx } from "@/lib/tx";

type Quote = {
  quoteId: string;
  shares: string;
  feeUsdc: string;
  expiresAt: string;
  disclaimer?: string;
};

type Stage =
  | { s: "idle" }
  | { s: "quoting" }
  | { s: "quoted"; quote: Quote }
  | { s: "building" }
  | { s: "signing" }
  | { s: "submitting" }
  | { s: "done"; signature: string; status: string }
  | { s: "error"; message: string };

async function post(path: string, body: unknown) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? j.message ?? `HTTP ${r.status}`);
  return j;
}

export default function BuyPanel({ marketId }: { marketId: string }) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const [sandbox, setSandbox] = useState(
    typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("sandbox") === "1",
  );
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [amount, setAmount] = useState("5.00");
  const [stage, setStage] = useState<Stage>({ s: "idle" });

  const env = sandbox ? "test" : "live";

  async function run() {
    if (!publicKey || !signTransaction) return;
    try {
      setStage({ s: "quoting" });
      const quote: Quote = await post("/api/trade/quote", {
        wallet: publicKey.toBase58(),
        marketId,
        side,
        amountUsdc: amount,
        env,
      });
      setStage({ s: "quoted", quote });

      setStage({ s: "building" });
      const build = await post("/api/trade/build", {
        quoteId: quote.quoteId,
        wallet: publicKey.toBase58(),
        maxSlippageBps: 100,
        env,
      });

      setStage({ s: "signing" });
      let signature: string;
      if (sandbox || !build.instructions?.length) {
        // sandbox: Panta returns fixture order ids; nothing hits Solana
        signature = build.signature ?? bs58.encode(Buffer.alloc(64, 1));
      } else {
        const tx = compileTx(build, publicKey);
        const signed = await signTransaction(tx);
        signature = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
        });
      }

      setStage({ s: "submitting" });
      await post("/api/trade/submit", {
        orderId: build.orderId,
        signature,
        env,
      });
      const verify = await post("/api/trade/verify", {
        orderId: build.orderId,
        signature,
        env,
      });
      setStage({ s: "done", signature, status: verify.status ?? "submitted" });
    } catch (e: any) {
      setStage({ s: "error", message: e?.message ?? String(e) });
    }
  }

  const busy = ["quoting", "building", "signing", "submitting"].includes(stage.s);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-zinc-300">Trade</h2>
        <button
          onClick={() => setSandbox(!sandbox)}
          className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
            sandbox
              ? "border-amber-600 text-amber-400"
              : "border-zinc-700 text-zinc-500"
          }`}
          title="Sandbox uses Panta test fixtures — nothing touches Solana mainnet"
        >
          {sandbox ? "SANDBOX" : "MAINNET"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        {(["yes", "no"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`py-2 rounded-lg text-sm font-bold uppercase transition-colors ${
              side === s
                ? s === "yes"
                  ? "bg-emerald-600 text-white"
                  : "bg-rose-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <label className="block text-xs text-zinc-500 mb-1">Amount (USDC)</label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        className="w-full mb-3 rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm outline-none focus:border-emerald-600"
      />

      {stage.s === "quoted" && (
        <div className="mb-3 text-xs text-zinc-400 space-y-1 border border-zinc-800 rounded-lg p-2.5">
          <div className="flex justify-between">
            <span>Expected shares</span>
            <span className="text-zinc-100">{stage.quote.shares}</span>
          </div>
          <div className="flex justify-between">
            <span>Fee</span>
            <span className="text-zinc-100">${stage.quote.feeUsdc}</span>
          </div>
          {stage.quote.disclaimer && (
            <p className="text-amber-500/80 pt-1">{stage.quote.disclaimer}</p>
          )}
        </div>
      )}

      <button
        onClick={run}
        disabled={!connected || busy}
        className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-sm font-bold transition-colors"
      >
        {!connected
          ? "Connect wallet to trade"
          : busy
            ? `${stage.s}…`
            : `Buy ${side.toUpperCase()} · $${amount}`}
      </button>

      {stage.s === "done" && (
        <p className="mt-3 text-xs text-emerald-400 break-all">
          Order {stage.status} — sig {stage.signature.slice(0, 20)}…
        </p>
      )}
      {stage.s === "error" && (
        <p className="mt-3 text-xs text-rose-400">{stage.message}</p>
      )}
      <p className="mt-3 text-[11px] text-zinc-600 leading-relaxed">
        Non-custodial: Panta builds the transaction, your wallet signs, we
        broadcast and report the signature for attribution.
      </p>
    </section>
  );
}
