"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_CHART_CANDLES, TIMEFRAME_MS, type CandleHistoryPage } from "@/lib/chart-data";
import type { Candle, ExchangeId, Timeframe } from "@/lib/types";

interface ChartFeed {
  candles: Candle[];
  fetchedAt: string | null;
  nextBefore: number | null;
  headLoaded: boolean;
  exhausted: boolean;
  loadingHistory: boolean;
  historyError: string | null;
  liveError: string | null;
}

const EMPTY: Candle[] = [];
const blank = (candles: Candle[] = EMPTY): ChartFeed => ({
  candles, fetchedAt: null, nextBefore: null, headLoaded: false, exhausted: false,
  loadingHistory: true, historyError: null, liveError: null,
});

function mergeBars(previous: Candle[], incoming: Candle[], preferIncoming: boolean): Candle[] {
  const candles = new Map(previous.map((c) => [c.openTime, c]));
  for (const c of incoming) {
    const old = candles.get(c.openTime);
    if (!old || (preferIncoming && (c.open !== old.open || c.high !== old.high || c.low !== old.low || c.close !== old.close || c.volume !== old.volume || c.closeTime !== old.closeTime))) {
      candles.set(c.openTime, c);
    }
  }
  return [...candles.values()].sort((a, b) => a.openTime - b.openTime).slice(-MAX_CHART_CANDLES);
}

export function useChartCandles(
  symbol: string,
  exchange: ExchangeId,
  timeframe: Timeframe,
  analysisTimeframe: Timeframe,
  initialCandles: Candle[],
) {
  const [feeds, setFeeds] = useState<Record<string, ChartFeed>>({});
  const cache = useRef<Record<string, ChartFeed>>({});
  const [revision, setRevision] = useState(0);
  const key = `${exchange}:${symbol}:${timeframe}`;
  const seed = timeframe === analysisTimeframe ? initialCandles : EMPTY;
  const initialSeed = useRef(seed);
  useEffect(() => { initialSeed.current = seed; }, [seed]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let feed = cache.current[key] ?? blank(initialSeed.current);
    let refreshing = false;
    function show(patch: Partial<ChartFeed>) {
      if (signal.aborted) return;
      const next = { ...feed, ...patch };
      feed = next;
      cache.current[key] = next;
      setFeeds((prev) => ({ ...prev, [key]: next }));
    }
    async function page(limit: number, before?: number) {
      const query = new URLSearchParams({ symbol, exchange, interval: timeframe, limit: String(limit) });
      if (before !== undefined) query.set("before", String(before));
      const res = await fetch(`/api/klines?${query}`, { cache: "no-store", signal });
      const data: CandleHistoryPage = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data;
    }
    async function refresh() {
      if (refreshing || !feed.headLoaded || document.hidden || signal.aborted) return;
      refreshing = true;
      try {
        // Catch up after a suspended tab instead of dropping the bars between refreshes.
        const elapsed = feed.fetchedAt ? Date.now() - Date.parse(feed.fetchedAt) : 0;
        const size = Math.max(8, Math.min(MAX_CHART_CANDLES, Math.ceil(elapsed / TIMEFRAME_MS[timeframe]) + 5));
        const recent = await page(size);
        if (!recent.candles.length && feed.candles.length) throw new Error(`${exchange}: no recent candles returned`);
        show({ candles: mergeBars(feed.candles, recent.candles, true), fetchedAt: recent.fetchedAt, liveError: recent.error });
      } catch (cause) {
        show({ liveError: cause instanceof Error ? cause.message : "Could not refresh latest candles" });
      } finally {
        refreshing = false;
      }
    }
    async function loadHistory() {
      show({ loadingHistory: !feed.exhausted && feed.candles.length < MAX_CHART_CANDLES, historyError: null });
      try {
        if (!feed.headLoaded) {
          const latest = await page(500);
          if (signal.aborted) return;
          show({ candles: mergeBars([], latest.candles, true), fetchedAt: latest.fetchedAt, headLoaded: true, exhausted: latest.exhausted, nextBefore: latest.nextBefore, liveError: null });
        } else {
          void refresh();
        }
        let emptyPages = 0;
        let pages = 0;
        while (!signal.aborted && feed.nextBefore !== null && !feed.exhausted && feed.candles.length < MAX_CHART_CANDLES) {
          const cursor = feed.nextBefore;
          const older = await page(Math.min(1_500, MAX_CHART_CANDLES - feed.candles.length), cursor);
          if (signal.aborted) return;
          const candles = mergeBars(feed.candles, older.candles, false);
          emptyPages = candles.length > feed.candles.length ? 0 : emptyPages + 1;
          show({ candles, nextBefore: older.nextBefore, exhausted: older.exhausted });
          if (older.error) throw new Error(older.error);
          if (!older.exhausted && (older.nextBefore === null || older.nextBefore >= cursor || emptyPages >= 2 || (++pages >= 12 && feed.candles.length < MAX_CHART_CANDLES))) {
            throw new Error("History is partial; the exchange returned gaps in this range.");
          }
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Could not load history";
        show({ historyError: message, ...(feed.headLoaded ? {} : { liveError: message }) });
      } finally {
        show({ loadingHistory: false });
      }
    }

    void loadHistory();
    const interval = window.setInterval(refresh, 10_000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [symbol, exchange, timeframe, key, revision]);

  return { feed: feeds[key] ?? blank(seed), retry: () => setRevision((value) => value + 1) };
}
