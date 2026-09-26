"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  createChart,
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
} from "lightweight-charts";
import { Candle } from "@/lib/api";

export default function CandleChart({
  candles,
  livePrice,
}: {
  candles: Candle[];
  livePrice: number | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      autoSize: true,
      layout: {
        background: { color: "transparent" },
        textColor: "#6e6a61",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "#efece4" },
        horzLines: { color: "#efece4" },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: "#e8e4da" },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#3d8b62",
      downColor: "#c0563f",
      borderVisible: false,
      wickUpColor: "#3d8b62",
      wickDownColor: "#c0563f",
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      candles.map((c) => ({
        time: c.bucketStart as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    chartRef.current?.timeScale().scrollToRealTime();
  }, [candles]);

  // fold live ticks into the last candle
  useEffect(() => {
    if (!seriesRef.current || livePrice === null || candles.length === 0) return;
    const last = candles[candles.length - 1];
    seriesRef.current.update({
      time: last.bucketStart as UTCTimestamp,
      open: last.open,
      high: Math.max(last.high, livePrice),
      low: Math.min(last.low, livePrice),
      close: livePrice,
    });
  }, [livePrice, candles]);

  if (candles.length === 0) {
    return (
      <div className="h-105 flex items-center justify-center rounded-xl border border-line bg-cream px-8 text-center text-sm text-mute">
        No price history yet — snapshots accumulate every 30 s while the market
        moves. Panta itself doesn't expose history; this chart is built from
        our own capture layer.
      </div>
    );
  }

  return <div ref={ref} className="h-105 w-full rounded-xl overflow-hidden" />;
}
