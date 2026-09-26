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

export default function BuyPanel({
  marketId,
  yesPrice,
}: {
  marketId: string;
  yesPrice?: number | null;
}) {
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

  const busy = ["quoting", "building", "signing", "submitting"].includes(
    stage.s,
  );

  return (
    <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Trade</h2>
        <button
          onClick={() => setSandbox(!sandbox)}
          className={`tnum rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors duration-200 ${
            sandbox
              ? "border-accent/40 bg-accent-soft text-accent-deep"
              : "border-line bg-parchment text-mute"
          }`}
          title="Sandbox uses Panta test fixtures — nothing touches Solana mainnet"
        >
          {sandbox ? "SANDBOX" : "MAINNET"}
        </button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["yes", "no"] as const).map((s) => {
          const pct =
            yesPrice == null
              ? null
              : Math.round((s === "yes" ? yesPrice : 1 - yesPrice) * 100);
          return (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`rounded-xl py-2 text-sm font-bold uppercase transition-colors duration-200 ${
                side === s
                  ? s === "yes"
                    ? "bg-yes text-white"
                    : "bg-no text-white"
                  : "bg-parchment text-mute hover:bg-line"
              }`}
            >
              {s}
              {pct !== null && (
                <span className="tnum ml-1 font-semibold opacity-90">
                  {pct}¢
                </span>
              )}
            </button>
          );
        })}
      </div>

      <label className="mb-1 block text-xs text-mute">Amount (USDC)</label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        inputMode="decimal"
        className="tnum mb-4 w-full rounded-xl border border-line bg-cream px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent"
      />

      {stage.s === "quoted" && (
        <div className="mb-4 space-y-1 rounded-xl border border-line bg-cream p-3 text-xs text-mute">
          <div className="flex justify-between">
            <span>Expected shares</span>
            <span className="tnum text-ink">{stage.quote.shares}</span>
          </div>
          <div className="flex justify-between">
            <span>Fee</span>
            <span className="tnum text-ink">${stage.quote.feeUsdc}</span>
          </div>
          {stage.quote.disclaimer && (
            <p className="pt-1 text-accent-deep">{stage.quote.disclaimer}</p>
          )}
        </div>
      )}

      <button
        onClick={run}
        disabled={!connected || busy}
        className="w-full rounded-full bg-accent py-2.5 text-sm font-semibold text-white transition-colors duration-200 hover:bg-accent-deep disabled:bg-parchment disabled:text-faint"
      >
        {!connected
          ? "Connect wallet to trade"
          : busy
            ? `${stage.s}…`
            : `Buy ${side.toUpperCase()} · $${amount}`}
      </button>

      {stage.s === "done" && (
        <p className="tnum mt-3 break-all text-xs text-yes">
          Order {stage.status} — sig {stage.signature.slice(0, 20)}…
        </p>
      )}
      {stage.s === "error" && (
        <p className="mt-3 text-xs text-no">{stage.message}</p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-faint">
        Non-custodial: Panta builds the transaction, your wallet signs, we
        broadcast and report the signature for attribution.
      </p>
    </section>
  );
}
