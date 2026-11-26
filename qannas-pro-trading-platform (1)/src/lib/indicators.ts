import {
  Candle,
  ClassicalIndicators,
  SupportResistanceData,
  Timeframe,
} from "./types";

export function emaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length);
  let sum = 0;
  const seedLen = Math.min(period, values.length);
  for (let i = 0; i < seedLen; i++) sum += values[i];
  let ema = sum / seedLen;
  for (let i = 0; i < values.length; i++) {
    if (i < seedLen) {
      out[i] = ema;
    } else {
      ema = values[i] * k + ema * (1 - k);
      out[i] = ema;
    }
  }
  return out;
}

export function sma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-Math.min(period, values.length));
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function rsiSeries(closes: number[], period = 14): number[] {
  if (closes.length < 2) return closes.map(() => 50);
  const out: number[] = new Array(closes.length).fill(50);
  let avgGain = 0;
  let avgLoss = 0;
  const firstWindow = Math.min(period, closes.length - 1);

  for (let i = 1; i <= firstWindow; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= firstWindow;
  avgLoss /= firstWindow;
  out[firstWindow] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = firstWindow + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function atrSeries(candles: Candle[], period = 14): number[] {
  if (candles.length === 0) return [];
  const tr: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    tr.push(
      Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose)
      )
    );
  }
  const out: number[] = new Array(candles.length).fill(tr[0] || 0);
  const seedLen = Math.min(period, tr.length);
  let atr = tr.slice(0, seedLen).reduce((a, b) => a + b, 0) / seedLen;
  for (let i = 0; i < tr.length; i++) {
    if (i < seedLen) {
      out[i] = atr;
    } else {
      atr = (atr * (period - 1) + tr[i]) / period;
      out[i] = atr;
    }
  }
  return out;
}

export function computeMacd(closes: number[]): {
  macd: number;
  signal: number;
  histogram: number;
} {
  if (closes.length < 26) return { macd: 0, signal: 0, histogram: 0 };
  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const sigLine = emaSeries(macdLine, 9);
  const lastIdx = closes.length - 1;
  const macd = macdLine[lastIdx];
  const signal = sigLine[lastIdx];
  return { macd, signal, histogram: macd - signal };
}

export function computeBollinger(
  closes: number[],
  period = 20,
  mult = 2
): { upper: number; middle: number; lower: number } {
  const slice = closes.slice(-Math.min(period, closes.length));
  const mean = slice.reduce((a, b) => a + b, 0) / Math.max(slice.length, 1);
  const variance =
    slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / Math.max(slice.length, 1);
  const std = Math.sqrt(variance);
  return {
    upper: mean + mult * std,
    middle: mean,
    lower: mean - mult * std,
  };
}

export function computeVwap(candles: Candle[], lookback = 48): number {
  const slice = candles.slice(-Math.min(lookback, candles.length));
  let pv = 0;
  let vol = 0;
  for (const c of slice) {
    const typical = (c.high + c.low + c.close) / 3;
    pv += typical * c.volume;
    vol += c.volume;
  }
  return vol > 0 ? pv / vol : slice[slice.length - 1]?.close ?? 0;
}

export function computeAdx(candles: Candle[], period = 14): number {
  if (candles.length < period + 2) return 20;
  const plusDm: number[] = [];
  const minusDm: number[] = [];
  const trs: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDm.push(up > down && up > 0 ? up : 0);
    minusDm.push(down > up && down > 0 ? down : 0);
    trs.push(
      Math.max(
        candles[i].high - candles[i].low,
        Math.abs(candles[i].high - candles[i - 1].close),
        Math.abs(candles[i].low - candles[i - 1].close)
      )
    );
  }

  let smTr = trs.slice(0, period).reduce((a, b) => a + b, 0);
  let smPlus = plusDm.slice(0, period).reduce((a, b) => a + b, 0);
  let smMinus = minusDm.slice(0, period).reduce((a, b) => a + b, 0);
  const dxList: number[] = [];

  for (let i = period; i < trs.length; i++) {
    smTr = smTr - smTr / period + trs[i];
    smPlus = smPlus - smPlus / period + plusDm[i];
    smMinus = smMinus - smMinus / period + minusDm[i];
    const pdi = smTr > 0 ? (100 * smPlus) / smTr : 0;
    const mdi = smTr > 0 ? (100 * smMinus) / smTr : 0;
    const denom = pdi + mdi;
    dxList.push(denom > 0 ? (100 * Math.abs(pdi - mdi)) / denom : 0);
  }

  if (dxList.length === 0) return 20;
  const recent = dxList.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

export function computeObv(candles: Candle[]): {
  obv: number;
  trend: "UP" | "DOWN" | "FLAT";
} {
  if (candles.length < 2) return { obv: 0, trend: "FLAT" };
  const series: number[] = [0];
  let obv = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].close > candles[i - 1].close) obv += candles[i].volume;
    else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume;
    series.push(obv);
  }
  const fast = sma(series, 5);
  const slow = sma(series, 20);
  const diff = fast - slow;
  const scale = Math.max(Math.abs(slow), 1e-9);
  let trend: "UP" | "DOWN" | "FLAT" = "FLAT";
  if (diff / scale > 0.01) trend = "UP";
  else if (diff / scale < -0.01) trend = "DOWN";
  return { obv, trend };
}

export function computeStochRsi(closes: number[]): { k: number; d: number } {
  const rsis = rsiSeries(closes, 14);
  if (rsis.length < 20) return { k: 50, d: 50 };
  const stoch: number[] = [];
  for (let i = 14; i < rsis.length; i++) {
    const win = rsis.slice(i - 13, i + 1);
    const min = Math.min(...win);
    const max = Math.max(...win);
    stoch.push(max - min > 0 ? ((rsis[i] - min) / (max - min)) * 100 : 50);
  }
  const kSeries: number[] = [];
  for (let i = 2; i < stoch.length; i++) {
    kSeries.push((stoch[i] + stoch[i - 1] + stoch[i - 2]) / 3);
  }
  const k = kSeries[kSeries.length - 1] ?? 50;
  const d =
    kSeries.length >= 3
      ? (kSeries[kSeries.length - 1] +
          kSeries[kSeries.length - 2] +
          kSeries[kSeries.length - 3]) /
        3
      : k;
  return { k, d };
}

export function computeVolumeProfile(
  candles: Candle[],
  bins = 24
): { poc: number; vah: number; val: number } {
  const slice = candles.slice(-Math.min(100, candles.length));
  if (slice.length === 0) return { poc: 0, vah: 0, val: 0 };
  const minLow = Math.min(...slice.map((c) => c.low));
  const maxHigh = Math.max(...slice.map((c) => c.high));
  if (maxHigh <= minLow) return { poc: minLow, vah: maxHigh, val: minLow };

  const step = (maxHigh - minLow) / bins;
  const binVol = new Array<number>(bins).fill(0);

  for (const c of slice) {
    const typical = (c.high + c.low + c.close) / 3;
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((typical - minLow) / step)));
    binVol[idx] += c.volume;
  }

  let pocIdx = 0;
  let totalVol = 0;
  for (let i = 0; i < bins; i++) {
    totalVol += binVol[i];
    if (binVol[i] > binVol[pocIdx]) pocIdx = i;
  }

  // Expand from POC until 70% of volume is captured (Value Area)
  const targetVol = totalVol * 0.7;
  let accVol = binVol[pocIdx];
  let lowIdx = pocIdx;
  let highIdx = pocIdx;

  while (accVol < targetVol && (lowIdx > 0 || highIdx < bins - 1)) {
    const lowerVol = lowIdx > 0 ? binVol[lowIdx - 1] : -1;
    const upperVol = highIdx < bins - 1 ? binVol[highIdx + 1] : -1;
    if (upperVol >= lowerVol && highIdx < bins - 1) {
      highIdx++;
      accVol += binVol[highIdx];
    } else if (lowIdx > 0) {
      lowIdx--;
      accVol += binVol[lowIdx];
    } else {
      break;
    }
  }

  return {
    poc: minLow + (pocIdx + 0.5) * step,
    val: minLow + lowIdx * step,
    vah: minLow + (highIdx + 1) * step,
  };
}

export function computeClassicalIndicators(
  timeframe: Timeframe,
  candles: Candle[]
): ClassicalIndicators {
  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1] ?? 0;
  const e20 = emaSeries(closes, 20);
  const e50 = emaSeries(closes, 50);
  const e200 = closes.length >= 120 ? emaSeries(closes, Math.min(200, closes.length)) : null;
  const rsis = rsiSeries(closes, 14);
  const atrs = atrSeries(candles, 14);
  const macd = computeMacd(closes);
  const bb = computeBollinger(closes, 20, 2);
  const vwap = computeVwap(candles, 48);
  const adx14 = computeAdx(candles, 14);
  const obvRes = computeObv(candles);
  const stoch = computeStochRsi(closes);

  const ema20 = e20[e20.length - 1] ?? price;
  const ema50 = e50[e50.length - 1] ?? price;
  const ema200 = e200 ? e200[e200.length - 1] : null;
  const rsi14 = rsis[rsis.length - 1] ?? 50;
  const atr14 = atrs[atrs.length - 1] ?? price * 0.01;
  const atrPct = price > 0 ? (atr14 / price) * 100 : 0;

  let trendLabel: "BULLISH" | "BEARISH" | "NEUTRAL" = "NEUTRAL";
  if (price > ema20 && ema20 > ema50) trendLabel = "BULLISH";
  else if (price < ema20 && ema20 < ema50) trendLabel = "BEARISH";
  else if (price > ema20 && rsi14 >= 50) trendLabel = "BULLISH";
  else if (price < ema20 && rsi14 <= 45) trendLabel = "BEARISH";

  return {
    timeframe,
    price,
    ema20,
    ema50,
    ema200,
    rsi14,
    macd: macd.macd,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    atr14,
    atrPct,
    bbUpper: bb.upper,
    bbMiddle: bb.middle,
    bbLower: bb.lower,
    vwap,
    adx14,
    obv: obvRes.obv,
    obvTrend: obvRes.trend,
    stochRsiK: stoch.k,
    stochRsiD: stoch.d,
    trendLabel,
  };
}

export function computeSupportResistance(candles: Candle[]): SupportResistanceData {
  const slice = candles.slice(-Math.min(120, candles.length));
  const lastPrice = slice[slice.length - 1]?.close ?? 0;

  const swingLows: number[] = [];
  const swingHighs: number[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    const c = slice[i];
    if (
      c.low <= slice[i - 1].low &&
      c.low <= slice[i - 2].low &&
      c.low <= slice[i + 1].low &&
      c.low <= slice[i + 2].low
    ) {
      swingLows.push(c.low);
    }
    if (
      c.high >= slice[i - 1].high &&
      c.high >= slice[i - 2].high &&
      c.high >= slice[i + 1].high &&
      c.high >= slice[i + 2].high
    ) {
      swingHighs.push(c.high);
    }
  }

  // Cluster levels within 0.6%
  const clusterLevels = (vals: number[]): number[] => {
    const sorted = [...vals].sort((a, b) => a - b);
    const clusters: number[][] = [];
    for (const v of sorted) {
      const last = clusters[clusters.length - 1];
      if (!last || Math.abs(v - last[last.length - 1]) / Math.max(v, 1e-12) > 0.006) {
        clusters.push([v]);
      } else {
        last.push(v);
      }
    }
    return clusters.map((cl) => cl.reduce((a, b) => a + b, 0) / cl.length);
  };

  const supports = clusterLevels(swingLows.filter((l) => l < lastPrice))
    .sort((a, b) => b - a)
    .slice(0, 4);
  const resistances = clusterLevels(swingHighs.filter((h) => h > lastPrice))
    .sort((a, b) => a - b)
    .slice(0, 4);

  // Classic Pivot Points from previous bar or recent 24-bar range
  const prevWindow = slice.slice(-Math.min(25, slice.length), -1);
  const pHigh = prevWindow.length ? Math.max(...prevWindow.map((c) => c.high)) : lastPrice;
  const pLow = prevWindow.length ? Math.min(...prevWindow.map((c) => c.low)) : lastPrice;
  const pClose = prevWindow[prevWindow.length - 1]?.close ?? lastPrice;
  const pp = (pHigh + pLow + pClose) / 3;
  const r1 = 2 * pp - pLow;
  const s1 = 2 * pp - pHigh;
  const r2 = pp + (pHigh - pLow);
  const s2 = pp - (pHigh - pLow);
  const r3 = pHigh + 2 * (pp - pLow);
  const s3 = pLow - 2 * (pHigh - pp);

  // Fibonacci retracement from last 90 bars
  const fibWin = slice.slice(-Math.min(90, slice.length));
  const swingLow = fibWin.length ? Math.min(...fibWin.map((c) => c.low)) : lastPrice;
  const swingHigh = fibWin.length ? Math.max(...fibWin.map((c) => c.high)) : lastPrice;
  const diff = swingHigh - swingLow;

  return {
    supports,
    resistances,
    pivot: { pp, r1, r2, r3, s1, s2, s3 },
    fibonacci: {
      swingLow,
      swingHigh,
      fib236: swingHigh - diff * 0.236,
      fib382: swingHigh - diff * 0.382,
      fib500: swingHigh - diff * 0.5,
      fib618: swingHigh - diff * 0.618,
      fib786: swingHigh - diff * 0.786,
    },
  };
}
