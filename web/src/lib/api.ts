"use client";

import { useEffect, useRef, useState } from "react";

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export type RadarMarket = {
  marketId: string;
  category: string | null;
  title: string | null;
  status: string | null;
  phase: string | null;
  endTime: number | null;
  volumeUsdc: number | null;
  yesPrice: number | null;
  noPrice: number | null;
  priceTs: number | null;
};

export type Candle = {
  bucketStart: number;
  open: number;
  high: number;
  low: number;
  close: number;
  ticks: number;
};

export type WalletStat = {
  wallet: string;
  trades: number;
  volumeUsdc: number;
  marketsTouched: number;
  lastActive: number | null;
  realizedPnl: number | null;
  wins: number;
  losses: number;
};

export type LiveEvent =
  | { type: "tick"; ts: number; markets: number }
  | { type: "price"; marketId: string; ts: number; yesPrice: number; volumeUsdc: number | null }
  | { type: "trade"; marketId: string; wallet: string | null; side: string | null; amountUsdc: number | null; ts: number | null };

export async function fetchRadar(): Promise<{ items: RadarMarket[]; count: number }> {
  const r = await fetch(`${API}/api/markets`, { cache: "no-store" });
  if (!r.ok) throw new Error(`radar HTTP ${r.status}`);
  return r.json();
}

export async function fetchCandles(id: string, interval: number): Promise<Candle[]> {
  const r = await fetch(`${API}/api/markets/${id}/candles?interval=${interval}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`candles HTTP ${r.status}`);
  return (await r.json()).candles;
}

export async function fetchMarketDetail(id: string): Promise<any> {
  const r = await fetch(`${API}/api/markets/${id}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`detail HTTP ${r.status}`);
  return r.json();
}

export async function fetchTrades(id: string): Promise<any[]> {
  const r = await fetch(`${API}/api/markets/${id}/trades`, { cache: "no-store" });
  if (!r.ok) throw new Error(`trades HTTP ${r.status}`);
  return r.json();
}

export async function fetchLeaderboard(limit = 50): Promise<WalletStat[]> {
  const r = await fetch(`${API}/api/leaderboard?limit=${limit}`, { cache: "no-store" });
  if (!r.ok) throw new Error(`leaderboard HTTP ${r.status}`);
  return (await r.json()).items;
}

/** Subscribe to the backend's live event stream; auto-reconnects. */
export function useLiveEvents(onEvent: (e: LiveEvent) => void) {
  const [connected, setConnected] = useState(false);
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(`${API.replace(/^http/, "ws")}/ws`);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (m) => {
        try {
          cb.current(JSON.parse(m.data));
        } catch {}
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return connected;
}

export function fmtUsd(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(2)}`;
}

export function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

export function fmtTime(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString();
}

export function shortWallet(w: string): string {
  return w.length > 12 ? `${w.slice(0, 5)}…${w.slice(-4)}` : w;
}
