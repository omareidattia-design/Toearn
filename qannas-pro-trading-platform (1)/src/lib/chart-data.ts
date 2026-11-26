import type { Candle, Timeframe, ZoneBox } from "./types";

export interface SavedChartPlan {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  timeframe: Timeframe;
  zones: ZoneBox[];
  /** ISO time the entry price was fixed: signal discovery, or activation for a trade opened straight from analysis. */
  startedAt: string | null;
}

export const MAX_CHART_CANDLES = 5_000;
export const TIMEFRAME_MS: Record<Timeframe, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export interface CandleHistoryPage {
  candles: Candle[];
  nextBefore: number | null;
  exhausted: boolean;
  partial: boolean;
  error: string | null;
  fetchedAt: string;
}
