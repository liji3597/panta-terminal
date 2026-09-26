"use client";

import { useEffect, useRef } from "react";
import {
  AreaSeries,
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
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);

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
    const series = chart.addSeries(AreaSeries, {
      lineColor: "#3d8b62",
      lineWidth: 2,
      topColor: "rgba(61, 139, 98, 0.24)",
      bottomColor: "rgba(61, 139, 98, 0.02)",
      priceLineColor: "#d97757",
      priceLineWidth: 1,
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
        value: c.close,
      })),
    );
    // sparse data: fit everything on screen instead of scrolling to now
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // fold live ticks into the latest point
  useEffect(() => {
    if (!seriesRef.current || livePrice === null || candles.length === 0) return;
    const last = candles[candles.length - 1];
    seriesRef.current.update({
      time: last.bucketStart as UTCTimestamp,
      value: livePrice,
    });
  }, [livePrice, candles]);

  // chart container is ALWAYS mounted so the create-effect above runs on
  // first render; the empty state is just an overlay, data folds in later
  return (
    <div className="relative h-105 w-full overflow-hidden rounded-xl border border-line bg-cream">
      <div ref={ref} className="absolute inset-0" />
      {candles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-cream px-8 text-center text-sm text-mute">
          No price history yet — snapshots accumulate every 30 s while the
          market moves, and the trade tape backfills to a market's first
          trade. Panta itself doesn't expose history; this chart is built
          from our own capture layer.
        </div>
      )}
    </div>
  );
}
