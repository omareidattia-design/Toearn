import {
  atrSeries,
  computeClassicalIndicators,
  computeSupportResistance,
  computeVolumeProfile,
  emaSeries,
  rsiSeries,
  sma,
} from "./indicators";
import {
  ALL_TIMEFRAMES,
  Candle,
  ClassicalIndicators,
  ConfluenceFactor,
  DiscoveredPair,
  EntryMode,
  MarketContext,
  QualityGateResult,
  REJECTION_CATALOG,
  SmcAnalysisResult,
  StepEvaluation,
  STRATEGY_RULES,
  Ticker24h,
  Timeframe,
  TradePlan,
  ZoneBox,
} from "./types";

interface SwingPoint {
  index: number;
  price: number;
  time: number;
}

function findSwingLows(candles: Candle[], left = 2, right = 2): SwingPoint[] {
  const pts: SwingPoint[] = [];
  for (let i = left; i < candles.length - right; i++) {
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && candles[j].low < candles[i].low) {
        isLow = false;
        break;
      }
    }
    if (isLow) pts.push({ index: i, price: candles[i].low, time: candles[i].openTime });
  }
  return pts;
}

function findSwingHighs(candles: Candle[], left = 2, right = 2): SwingPoint[] {
  const pts: SwingPoint[] = [];
  for (let i = left; i < candles.length - right; i++) {
    let isHigh = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j !== i && candles[j].high > candles[i].high) {
        isHigh = false;
        break;
      }
    }
    if (isHigh) pts.push({ index: i, price: candles[i].high, time: candles[i].openTime });
  }
  return pts;
}

export function formatPriceCompact(p: number): string {
  if (!Number.isFinite(p) || p === 0) return "0";
  if (p >= 1000) return p.toFixed(2);
  if (p >= 10) return p.toFixed(3);
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  if (p >= 0.0001) return p.toFixed(7);
  return p.toFixed(9);
}

export interface AnalyzeInputs {
  pair: DiscoveredPair;
  timeframe: Timeframe;
  entryCandles: Candle[];
  dailyCandles: Candle[];
  h4Candles: Candle[];
  ticker: Ticker24h | null;
  btcContext: MarketContext;
  entryMode?: EntryMode;
  allTfCandles?: Partial<Record<Timeframe, Candle[]>>;
}

export function analyzeSmcBottomHunt(input: AnalyzeInputs): SmcAnalysisResult {
  const {
    pair,
    timeframe,
    entryMode,
    entryCandles,
    dailyCandles,
    h4Candles,
    ticker,
    btcContext,
    allTfCandles,
  } = input;

  // OPTION B is additive and strict-only: Option A keeps its original thresholds untouched.
  const strict = (entryMode ?? "A") === "B";
  const scoreThreshold = strict ? STRATEGY_RULES.STRICT.SCORE : STRATEGY_RULES.SCORE_THRESHOLD;
  const rrThreshold = strict ? STRATEGY_RULES.STRICT.MIN_RR_TP2 : STRATEGY_RULES.MIN_RR_TP2;
  const volumeThreshold = strict ? STRATEGY_RULES.STRICT.MIN_VOLUME_24H_USDT : STRATEGY_RULES.MIN_VOLUME_24H_USDT;
  const spreadThreshold = strict ? STRATEGY_RULES.STRICT.MAX_SPREAD_PCT : STRATEGY_RULES.MAX_SPREAD_PCT;

  const analyzedAt = new Date().toISOString();
  const lastCandle = entryCandles[entryCandles.length - 1];
  const currentPrice = ticker?.lastPrice || lastCandle?.close || 0;
  const priceChange24h = ticker?.priceChangePercent ?? 0;
  const volume24hUsdt = ticker?.quoteVolume ?? 0;
  const high24h = ticker?.highPrice || lastCandle?.high || currentPrice;
  const low24h = ticker?.lowPrice || lastCandle?.low || currentPrice;
  const spreadPct = ticker?.spreadPct ?? 0;

  const rejections = new Set<string>();
  const signalReasons: SmcAnalysisResult["signalReasons"] = [];

  // Fallback for insufficient data
  if (entryCandles.length < 35 || h4Candles.length < 20 || dailyCandles.length < 15) {
    rejections.add("INSUFFICIENT_CANDLES");
  }

  const atrs = atrSeries(entryCandles, 14);
  const atr = atrs[atrs.length - 1] || currentPrice * 0.015;
  const entryIndicators = computeClassicalIndicators(timeframe, entryCandles);
  const dailyIndicators = computeClassicalIndicators("1d", dailyCandles);
  const h4Indicators = computeClassicalIndicators("4h", h4Candles);
  const levels = computeSupportResistance(entryCandles);

  // =========================================================================
  // STEP 1 (Weight 25): Bullish HTF Bias & Bottom Stabilization (1d + 4h)
  // Tailored for SMC/ICT Bottom-Hunting (اصطياد القاع)
  // =========================================================================
  const d1Closes = dailyCandles.map((c) => c.close);
  const d1Ema20 = emaSeries(d1Closes, 20);
  const d1Ema50 = emaSeries(d1Closes, Math.min(50, d1Closes.length));
  const d1RsiArr = rsiSeries(d1Closes, 14);
  const d1Last = d1Closes[d1Closes.length - 1] ?? currentPrice;
  const d1E20 = d1Ema20[d1Ema20.length - 1] ?? d1Last;
  const d1E50 = d1Ema50[d1Ema50.length - 1] ?? d1Last;
  const d1Rsi = d1RsiArr[d1RsiArr.length - 1] ?? 50;
  const d1PrevRsi = d1RsiArr[Math.max(0, d1RsiArr.length - 3)] ?? d1Rsi;

  const h4Closes = h4Candles.map((c) => c.close);
  const h4Ema20 = emaSeries(h4Closes, 20);
  const h4Ema50 = emaSeries(h4Closes, Math.min(50, h4Closes.length));
  const h4RsiArr = rsiSeries(h4Closes, 14);
  const h4Last = h4Closes[h4Closes.length - 1] ?? currentPrice;
  const h4E20 = h4Ema20[h4Ema20.length - 1] ?? h4Last;
  const h4E50 = h4Ema50[h4Ema50.length - 1] ?? h4Last;
  const h4Rsi = h4RsiArr[h4RsiArr.length - 1] ?? 50;
  const h4PrevRsi = h4RsiArr[Math.max(0, h4RsiArr.length - 4)] ?? h4Rsi;

  // Check HTF bottom stabilization (higher low on 4h or oversold bottom bounce)
  const h4RecentLows = h4Candles.slice(-12).map((c) => c.low);
  const h4PrevLows = h4Candles.slice(-24, -12).map((c) => c.low);
  const h4HigherLow =
    h4RecentLows.length > 0 &&
    h4PrevLows.length > 0 &&
    Math.min(...h4RecentLows) >= Math.min(...h4PrevLows) * 0.992;

  const d1Bullish = d1Last >= d1E20 * 0.992 || d1E20 >= d1E50;
  const d1BottomStabilizing =
    (d1Rsi <= 42 && d1Rsi >= d1PrevRsi - 1.5) ||
    (dailyCandles.length >= 2 &&
      dailyCandles[dailyCandles.length - 1].close >= dailyCandles[dailyCandles.length - 1].open);

  const h4Bullish = h4Last >= h4E20 * 0.995 || h4E20 >= h4E50;
  const h4BottomTurn =
    h4HigherLow ||
    (h4Rsi > h4PrevRsi + 1.5 && h4Rsi >= 34) ||
    (h4Candles.length >= 2 && h4Candles[h4Candles.length - 1].close > h4E20);

  let step1Score = 0;
  let step1Status: StepEvaluation["status"] = "FAIL";
  let step1SummaryAr = "";
  let step1SummaryEn = "";

  if (d1Bullish && h4Bullish) {
    step1Score = 25;
    step1Status = "PASS";
    step1SummaryAr = `انحياز صاعد مكتمل على اليومي و4 ساعات — السعر مدعوم فوق المتوسطات (1d RSI ${d1Rsi.toFixed(1)} | 4h RSI ${h4Rsi.toFixed(1)})`;
    step1SummaryEn = `Full bullish alignment on 1d & 4h — price supported above EMAs (1d RSI ${d1Rsi.toFixed(1)} | 4h RSI ${h4Rsi.toFixed(1)})`;
    signalReasons.push({
      code: "HTF_BULLISH",
      labelAr: "انحياز صاعد 1d + 4h",
      labelEn: "Bullish 1d + 4h Bias",
      detail: `1d RSI ${d1Rsi.toFixed(1)} · 4h RSI ${h4Rsi.toFixed(1)}`,
      points: 25,
    });
  } else if ((d1Bullish && h4BottomTurn) || (h4Bullish && d1BottomStabilizing)) {
    step1Score = 20;
    step1Status = "PASS";
    step1SummaryAr = `تماسك قاع وانعكاس صاعد على الفريم الأعلى (4h يتحول للصعود مع دعم يومي — 1d RSI ${d1Rsi.toFixed(1)} | 4h RSI ${h4Rsi.toFixed(1)})`;
    step1SummaryEn = `HTF bottom stabilization & bullish turn (4h turning bullish with 1d support — 1d RSI ${d1Rsi.toFixed(1)} | 4h RSI ${h4Rsi.toFixed(1)})`;
    signalReasons.push({
      code: "HTF_BOTTOM_SUPPORT",
      labelAr: "تماسك قاع على الفريم الأعلى",
      labelEn: "HTF Bottom Stabilization",
      detail: `4h ${h4Bullish ? "صاعد" : "قاع أعلى"} · 1d RSI ${d1Rsi.toFixed(1)}`,
      points: 20,
    });
  } else if (d1BottomStabilizing && h4BottomTurn && h4HigherLow) {
    step1Score = 16;
    step1Status = "PARTIAL";
    step1SummaryAr = `ارتداد قاع مبكر على 4h (قاع أعلى مع تباطؤ هبوط اليومي — 1d RSI ${d1Rsi.toFixed(1)} | 4h RSI ${h4Rsi.toFixed(1)})`;
    step1SummaryEn = `Early bottoming bounce on 4h (higher low with 1d stabilization — 1d RSI ${d1Rsi.toFixed(1)} | 4h RSI ${h4Rsi.toFixed(1)})`;
    signalReasons.push({
      code: "HTF_EARLY_BOTTOM",
      labelAr: "تشكّل قاع على 4h/1d",
      labelEn: "4h/1d Bottom Formation",
      detail: `4h Higher Low · 1d RSI ${d1Rsi.toFixed(1)}`,
      points: 16,
    });
  } else {
    step1Score = 0;
    step1Status = "FAIL";
    rejections.add("HTF_BIAS_BEARISH");
    step1SummaryAr = `انحياز الفريم الأعلى هابط دون تماسك قاع (1d السعر ${formatPriceCompact(d1Last)} مقابل EMA20 ${formatPriceCompact(d1E20)} | 4h RSI ${h4Rsi.toFixed(1)})`;
    step1SummaryEn = `HTF bias is bearish with no bottom stabilization (1d close ${formatPriceCompact(d1Last)} vs EMA20 ${formatPriceCompact(d1E20)} | 4h RSI ${h4Rsi.toFixed(1)})`;
  }

  // =========================================================================
  // STEP 2 (Weight 20): Sell-side Liquidity Sweep (SSL) or Inducement
  // Detection window: last 30 candles vs ANY prior swing low / equal lows
  // Track SSL and BSL separately; SSL is mandatory for Long bottom hunting
  // =========================================================================
  const swingLows = findSwingLows(entryCandles, 2, 2);
  const swingHighs = findSwingHighs(entryCandles, 2, 2);
  const minorLows = findSwingLows(entryCandles, 1, 1);

  const sweepWindowStart = Math.max(5, entryCandles.length - 30);

  let sslSweep: {
    candleIndex: number;
    sweptLevel: number;
    wickLow: number;
    isEqualLows: boolean;
    isInducement: boolean;
  } | null = null;

  // Search newest to oldest within last 30 candles for Sell-side Liquidity Sweep (SSL)
  for (let i = entryCandles.length - 1; i >= sweepWindowStart; i--) {
    const c = entryCandles[i];
    // Major prior swing lows before candle i
    const priorLows = swingLows.filter((s) => s.index <= i - 2);
    for (let k = priorLows.length - 1; k >= 0; k--) {
      const target = priorLows[k];
      if (c.low < target.price && c.close > target.price) {
        // Check if equal lows cluster exists near target.price
        const eqCount = priorLows.filter(
          (p) =>
            p.index !== target.index &&
            Math.abs(p.price - target.price) / Math.max(target.price, 1e-12) <= 0.0045
        ).length;
        sslSweep = {
          candleIndex: i,
          sweptLevel: target.price,
          wickLow: c.low,
          isEqualLows: eqCount > 0,
          isInducement: false,
        };
        break;
      }
    }
    if (sslSweep) break;
  }

  // Fallback within last 30 candles: Inducement sweep of minor internal low
  if (!sslSweep) {
    for (let i = entryCandles.length - 1; i >= sweepWindowStart; i--) {
      const c = entryCandles[i];
      const priorMinor = minorLows.filter((s) => s.index <= i - 2 && s.index >= i - 45);
      for (let k = priorMinor.length - 1; k >= 0; k--) {
        const target = priorMinor[k];
        if (c.low < target.price && c.close > target.price) {
          sslSweep = {
            candleIndex: i,
            sweptLevel: target.price,
            wickLow: c.low,
            isEqualLows: false,
            isInducement: true,
          };
          break;
        }
      }
      if (sslSweep) break;
    }
  }

  // Track Buy-side Liquidity (BSL) sweep separately (context/target only — NEVER qualifies a Long entry)
  let bslSweepLevel: number | null = null;
  for (let i = entryCandles.length - 1; i >= sweepWindowStart; i--) {
    const c = entryCandles[i];
    const priorHighs = swingHighs.filter((s) => s.index <= i - 2);
    for (let k = priorHighs.length - 1; k >= 0; k--) {
      if (c.high > priorHighs[k].price && c.close < priorHighs[k].price) {
        bslSweepLevel = priorHighs[k].price;
        break;
      }
    }
    if (bslSweepLevel !== null) break;
  }

  const nearestSslPool =
    swingLows
      .filter((s) => s.price < currentPrice)
      .sort((a, b) => b.price - a.price)[0]?.price ?? levels.supports[0] ?? currentPrice * 0.97;
  const nearestBslPool =
    swingHighs
      .filter((s) => s.price > currentPrice)
      .sort((a, b) => a.price - b.price)[0]?.price ?? levels.resistances[0] ?? currentPrice * 1.03;

  let step2Score = 0;
  let step2Status: StepEvaluation["status"] = "FAIL";
  let step2SummaryAr = "";
  let step2SummaryEn = "";

  if (sslSweep && !sslSweep.isInducement) {
    step2Score = 20;
    step2Status = "PASS";
    const candlesAgo = entryCandles.length - 1 - sslSweep.candleIndex;
    step2SummaryAr = sslSweep.isEqualLows
      ? `تم كنس قيعان متساوية (SSL) أسفل ${formatPriceCompact(sslSweep.sweptLevel)} بذيل إلى ${formatPriceCompact(sslSweep.wickLow)} وإغلاق فوقها (قبل ${candlesAgo} شمعة)`
      : `تم كنس سيولة البيع (SSL) أسفل قاع ${formatPriceCompact(sslSweep.sweptLevel)} بذيل إلى ${formatPriceCompact(sslSweep.wickLow)} وإغلاق فوقه (قبل ${candlesAgo} شمعة)`;
    step2SummaryEn = sslSweep.isEqualLows
      ? `Swept equal lows (SSL) below ${formatPriceCompact(sslSweep.sweptLevel)} with wick to ${formatPriceCompact(sslSweep.wickLow)} and closed above (${candlesAgo} bars ago)`
      : `Swept sell-side liquidity (SSL) below ${formatPriceCompact(sslSweep.sweptLevel)} (wick ${formatPriceCompact(sslSweep.wickLow)}) and reclaimed (${candlesAgo} bars ago)`;
    signalReasons.push({
      code: "SSL_SWEEP",
      labelAr: sslSweep.isEqualLows ? "كنس قيعان متساوية SSL" : "كنس سيولة البيع SSL",
      labelEn: sslSweep.isEqualLows ? "Equal Lows SSL Sweep" : "Sell-side Liquidity Sweep",
      detail: `${formatPriceCompact(sslSweep.sweptLevel)} ← ${formatPriceCompact(sslSweep.wickLow)}`,
      points: 20,
    });
  } else if (sslSweep && sslSweep.isInducement) {
    step2Score = 15;
    step2Status = "PASS";
    const candlesAgo = entryCandles.length - 1 - sslSweep.candleIndex;
    step2SummaryAr = `تم رصد Inducement (كنس قاع داخلي) عند ${formatPriceCompact(sslSweep.sweptLevel)} بذيل ${formatPriceCompact(sslSweep.wickLow)} قبل ${candlesAgo} شمعة`;
    step2SummaryEn = `Detected bottom Inducement sweep at ${formatPriceCompact(sslSweep.sweptLevel)} (wick ${formatPriceCompact(sslSweep.wickLow)}) ${candlesAgo} bars ago`;
    signalReasons.push({
      code: "INDUCEMENT_SWEEP",
      labelAr: "كنس Inducement عند القاع",
      labelEn: "Bottom Inducement Sweep",
      detail: `${formatPriceCompact(sslSweep.sweptLevel)}`,
      points: 15,
    });
  } else {
    step2Score = 0;
    step2Status = "FAIL";
    rejections.add("NO_LIQUIDITY_SWEEP");
    step2SummaryAr = `لم يحدث كنس لسيولة البيع (SSL) في آخر 30 شمعة — أقرب تجمع سيولة بيع عند ${formatPriceCompact(nearestSslPool)}`;
    step2SummaryEn = `No sell-side liquidity sweep in last 30 candles — nearest SSL pool at ${formatPriceCompact(nearestSslPool)}`;
  }

  // =========================================================================
  // STEP 3 (Weight 20): Bullish Structure Break — CHoCH / MSS / BOS
  // Detection window: last 40 candles vs ANY prior swing high
  // A break stays valid even if a newer high has formed afterwards!
  // =========================================================================
  const breakWindowStart = Math.max(6, entryCandles.length - 40);
  const minorHighs = findSwingHighs(entryCandles, 1, 1);

  let structureBreak: {
    type: "CHoCH / MSS" | "BOS";
    candleIndex: number;
    brokenLevel: number;
    breakClose: number;
    afterSweep: boolean;
  } | null = null;

  // Prefer structure break occurring at or after SSL sweep (true ICT bottom reversal sequence!)
  const minBreakIdx = sslSweep ? Math.max(breakWindowStart, sslSweep.candleIndex) : breakWindowStart;

  const findBreakFrom = (startIdx: number, highsPool: SwingPoint[]): typeof structureBreak => {
    for (let i = entryCandles.length - 1; i >= startIdx; i--) {
      const c = entryCandles[i];
      const priorHighs = highsPool.filter((h) => h.index <= i - 2);
      for (let k = priorHighs.length - 1; k >= 0; k--) {
        const sh = priorHighs[k];
        if (c.close > sh.price && entryCandles[i - 1].close <= sh.price * 1.002) {
          // Determine if CHoCH/MSS (shift from prior lower highs) vs BOS
          const prevSh = priorHighs[k - 1];
          const isChoch = Boolean(
            (prevSh && sh.price < prevSh.price) ||
              (sslSweep && i >= sslSweep.candleIndex)
          );
          return {
            type: isChoch ? "CHoCH / MSS" : "BOS",
            candleIndex: i,
            brokenLevel: sh.price,
            breakClose: c.close,
            afterSweep: Boolean(sslSweep && i >= sslSweep.candleIndex),
          };
        }
      }
    }
    return null;
  };

  structureBreak =
    findBreakFrom(minBreakIdx, swingHighs) ??
    findBreakFrom(breakWindowStart, swingHighs) ??
    findBreakFrom(minBreakIdx, minorHighs);

  let step3Score = 0;
  let step3Status: StepEvaluation["status"] = "FAIL";
  let step3SummaryAr = "";
  let step3SummaryEn = "";

  if (structureBreak) {
    step3Score = structureBreak.type === "CHoCH / MSS" ? 20 : 18;
    step3Status = "PASS";
    const barsAgo = entryCandles.length - 1 - structureBreak.candleIndex;
    step3SummaryAr = `كسر بنية صاعد (${structureBreak.type}) بإغلاق ${formatPriceCompact(structureBreak.breakClose)} أعلى قمة ${formatPriceCompact(structureBreak.brokenLevel)} قبل ${barsAgo} شمعة`;
    step3SummaryEn = `Bullish ${structureBreak.type} closing at ${formatPriceCompact(structureBreak.breakClose)} above swing high ${formatPriceCompact(structureBreak.brokenLevel)} (${barsAgo} bars ago)`;
    signalReasons.push({
      code: structureBreak.type === "CHoCH / MSS" ? "CHOCH_MSS" : "BOS",
      labelAr: `كسر بنية ${structureBreak.type}`,
      labelEn: `${structureBreak.type} Break`,
      detail: `أعلى ${formatPriceCompact(structureBreak.brokenLevel)}`,
      points: step3Score,
    });
  } else {
    step3Score = 0;
    step3Status = "FAIL";
    rejections.add("NO_STRUCTURE_SHIFT");
    step3SummaryAr = `لا يوجد إغلاق فوق قمة سابقة (CHoCH / BOS) خلال آخر 40 شمعة — أقرب قمة للمراقبة ${formatPriceCompact(nearestBslPool)}`;
    step3SummaryEn = `No bullish close above a prior swing high (CHoCH / BOS) in last 40 candles — nearest high ${formatPriceCompact(nearestBslPool)}`;
  }

  // =========================================================================
  // STEP 6 CALCULATION FIRST (needed to verify POI is in Discount Zone):
  // Discount / Premium Zone (Weight 10)
  // On bullish break: from swept low (or pre-break swing low) to highest high after break.
  // Fallback when no break: last 90 candles range. Equilibrium = 50%.
  // =========================================================================
  let rangeLow = 0;
  let rangeHigh = 0;
  let discountSource: "SETUP_LEG" | "FALLBACK_90" = "FALLBACK_90";

  if (structureBreak) {
    discountSource = "SETUP_LEG";
    const legStart = sslSweep
      ? Math.min(sslSweep.candleIndex, structureBreak.candleIndex)
      : Math.max(0, structureBreak.candleIndex - 20);
    const legCandlesLow = entryCandles.slice(legStart, structureBreak.candleIndex + 1);
    const legCandlesHigh = entryCandles.slice(structureBreak.candleIndex);
    rangeLow = sslSweep
      ? Math.min(sslSweep.wickLow, ...legCandlesLow.map((c) => c.low))
      : Math.min(...legCandlesLow.map((c) => c.low));
    rangeHigh = Math.max(...legCandlesHigh.map((c) => c.high), structureBreak.breakClose);
  } else {
    const last90 = entryCandles.slice(-Math.min(90, entryCandles.length));
    rangeLow = Math.min(...last90.map((c) => c.low));
    rangeHigh = Math.max(...last90.map((c) => c.high));
  }

  if (rangeHigh <= rangeLow) {
    rangeHigh = rangeLow + atr;
  }

  const equilibrium = rangeLow + (rangeHigh - rangeLow) * 0.5;
  const positionPct = Math.max(
    0,
    Math.min(100, ((currentPrice - rangeLow) / (rangeHigh - rangeLow)) * 100)
  );
  const discountZoneType: "DEEP_DISCOUNT" | "DISCOUNT" | "PREMIUM" =
    positionPct <= 35 ? "DEEP_DISCOUNT" : positionPct <= 50 ? "DISCOUNT" : "PREMIUM";

  let step6Score = 0;
  let step6Status: StepEvaluation["status"] = "FAIL";
  let step6SummaryAr = "";
  let step6SummaryEn = "";

  if (positionPct <= 50) {
    step6Score = 10;
    step6Status = "PASS";
    step6SummaryAr =
      positionPct <= 35
        ? `السعر في منطقة خصم عميق (قاع مثالي) عند ${positionPct.toFixed(1)}% من المدى (أقل من حد التوازن ${formatPriceCompact(equilibrium)})`
        : `السعر داخل منطقة الخصم عند ${positionPct.toFixed(1)}% من مدى الإعداد (تحت التوازن ${formatPriceCompact(equilibrium)})`;
    step6SummaryEn =
      positionPct <= 35
        ? `Price in Deep Bottom Discount at ${positionPct.toFixed(1)}% of setup leg (below 50% EQ ${formatPriceCompact(equilibrium)})`
        : `Price in Discount Zone at ${positionPct.toFixed(1)}% of setup range (below 50% EQ ${formatPriceCompact(equilibrium)})`;
    signalReasons.push({
      code: positionPct <= 35 ? "DEEP_DISCOUNT" : "DISCOUNT_ZONE",
      labelAr: positionPct <= 35 ? "خصم عميق عند القاع" : "منطقة الخصم (<50%)",
      labelEn: positionPct <= 35 ? "Deep Bottom Discount" : "Discount Zone (<50%)",
      detail: `${positionPct.toFixed(1)}% من المدى`,
      points: 10,
    });
  } else {
    step6Score = 0;
    step6Status = "FAIL";
    rejections.add("PREMIUM_ZONE");
    rejections.add("NOT_IN_DISCOUNT");
    step6SummaryAr = `السعر في منطقة البريميم عند ${positionPct.toFixed(1)}% (فوق حد التوازن 50% عند ${formatPriceCompact(equilibrium)}) — مرفوض بسبب PREMIUM_ZONE`;
    step6SummaryEn = `Price is in Premium Zone at ${positionPct.toFixed(1)}% (above 50% equilibrium ${formatPriceCompact(equilibrium)}) — rejected PREMIUM_ZONE`;
  }

  // =========================================================================
  // STEP 4 (Weight 15): POI — Bullish Order Block or Bullish FVG in Discount
  // Detection window: last 60 candles
  // =========================================================================
  const poiWindowStart = Math.max(2, entryCandles.length - 60);
  const zones: ZoneBox[] = [];
  const lastTime = entryCandles[entryCandles.length - 1]?.openTime ?? Date.now();

  // Detect Bullish Order Blocks (last bearish candle before bullish impulse/displacement)
  let bestOb: { low: number; high: number; index: number; mitigated: boolean; inDiscount: boolean; recentTap: boolean } | null = null;
  for (let i = entryCandles.length - 2; i >= poiWindowStart; i--) {
    const c = entryCandles[i];
    const next = entryCandles[i + 1];
    if (!next) continue;
    const isBearish = c.close < c.open;
    const nextRange = next.high - next.low;
    const nextBody = next.close - next.open;
    const isStrongBullishFollow =
      nextBody > 0 &&
      nextRange >= (atrs[i + 1] || atr) * 0.75 &&
      next.close > c.high;

    if (isBearish && isStrongBullishFollow) {
      const obLow = c.low;
      const obHigh = Math.max(c.open, c.high);
      const inDiscount = obLow <= equilibrium;
      // Check if invalidated (closed decisively below OB low afterwards)
      // For bottom-hunting: require ACTIVE/RECENT mitigation (tapped in last 8 bars & still near POI, not chased far away!)
      let invalidated = false;
      let recentTap = false;
      const recentStart = Math.max(i + 2, entryCandles.length - 8);
      for (let j = i + 2; j < entryCandles.length; j++) {
        if (entryCandles[j].close < obLow - atr * 0.1) {
          invalidated = true;
          break;
        }
        if (
          j >= recentStart &&
          entryCandles[j].low <= obHigh + atr * 0.2 &&
          entryCandles[j].low >= obLow - atr * 0.15
        ) {
          recentTap = true;
        }
      }
      const currentlyInOrNear =
        currentPrice >= obLow && currentPrice <= obHigh + atr * 0.45;
      const notChased = currentPrice <= obHigh + atr * 1.1;
      const mitigated = !invalidated && notChased && (recentTap || currentlyInOrNear);

      if (!invalidated) {
        zones.push({
          type: "OB",
          low: obLow,
          high: obHigh,
          startTime: c.openTime,
          endTime: lastTime,
          mitigated,
          inDiscount,
          label: `Bullish OB (${formatPriceCompact(obLow)}–${formatPriceCompact(obHigh)})`,
        });
        if (inDiscount && (!bestOb || (mitigated && !bestOb.mitigated))) {
          bestOb = { low: obLow, high: obHigh, index: i, mitigated, inDiscount, recentTap };
        }
      }
      if (zones.filter((z) => z.type === "OB").length >= 3) break;
    }
  }

  // Detect Bullish Fair Value Gaps (FVG): candle[i-2].high < candle[i].low
  let bestFvg: { low: number; high: number; index: number; mitigated: boolean; inDiscount: boolean; recentTap: boolean } | null = null;
  for (let i = entryCandles.length - 1; i >= poiWindowStart + 2; i--) {
    const cPrev2 = entryCandles[i - 2];
    const cMid = entryCandles[i - 1];
    const cCurr = entryCandles[i];
    if (cMid.close > cMid.open && cPrev2.high < cCurr.low) {
      const gapSize = cCurr.low - cPrev2.high;
      if (gapSize >= atr * 0.15) {
        const fvgLow = cPrev2.high;
        const fvgHigh = cCurr.low;
        const inDiscount = fvgLow <= equilibrium;
        let invalidated = false;
        let recentTap = false;
        const recentStart = Math.max(i + 1, entryCandles.length - 8);
        for (let j = i + 1; j < entryCandles.length; j++) {
          if (entryCandles[j].close < fvgLow - atr * 0.1) {
            invalidated = true;
            break;
          }
          if (
            j >= recentStart &&
            entryCandles[j].low <= fvgHigh + atr * 0.15 &&
            entryCandles[j].low >= fvgLow - atr * 0.15
          ) {
            recentTap = true;
          }
        }
        const currentlyInOrNear =
          currentPrice >= fvgLow && currentPrice <= fvgHigh + atr * 0.45;
        const notChased = currentPrice <= fvgHigh + atr * 1.1;
        const mitigated = !invalidated && notChased && (recentTap || currentlyInOrNear);

        if (!invalidated) {
          zones.push({
            type: "FVG",
            low: fvgLow,
            high: fvgHigh,
            startTime: cMid.openTime,
            endTime: lastTime,
            mitigated,
            inDiscount,
            label: `Bullish FVG (${formatPriceCompact(fvgLow)}–${formatPriceCompact(fvgHigh)})`,
          });
          if (inDiscount && (!bestFvg || (mitigated && !bestFvg.mitigated))) {
            bestFvg = { low: fvgLow, high: fvgHigh, index: i, mitigated, inDiscount, recentTap };
          }
        }
        if (zones.filter((z) => z.type === "FVG").length >= 3) break;
      }
    }
  }

  let step4Score = 0;
  let step4Status: StepEvaluation["status"] = "FAIL";
  let step4SummaryAr = "";
  let step4SummaryEn = "";

  const activePoi =
    (bestOb?.mitigated ? { kind: "OB" as const, ...bestOb } : null) ??
    (bestFvg?.mitigated ? { kind: "FVG" as const, ...bestFvg } : null) ??
    (bestOb ? { kind: "OB" as const, ...bestOb } : null) ??
    (bestFvg ? { kind: "FVG" as const, ...bestFvg } : null);

  if (activePoi && activePoi.mitigated) {
    step4Score = 15;
    step4Status = "PASS";
    step4SummaryAr = `تم اختبار ${activePoi.kind === "OB" ? "Order Block شرائي" : "فجوة FVG شرائية"} داخل منطقة الخصم (${formatPriceCompact(activePoi.low)} – ${formatPriceCompact(activePoi.high)})`;
    step4SummaryEn = `Mitigated Bullish ${activePoi.kind} inside Discount Zone (${formatPriceCompact(activePoi.low)} – ${formatPriceCompact(activePoi.high)})`;
    signalReasons.push({
      code: activePoi.kind === "OB" ? "BULLISH_OB" : "BULLISH_FVG",
      labelAr: activePoi.kind === "OB" ? "اختبار Order Block شرائي" : "اختبار فجوة FVG شرائية",
      labelEn: activePoi.kind === "OB" ? "Bullish Order Block Retest" : "Bullish FVG Mitigation",
      detail: `${formatPriceCompact(activePoi.low)} – ${formatPriceCompact(activePoi.high)}`,
      points: 15,
    });
  } else if (activePoi && !activePoi.mitigated) {
    step4Score = 5;
    step4Status = "PARTIAL";
    rejections.add("POI_NOT_MITIGATED");
    step4SummaryAr = `تم رصد ${activePoi.kind} شرائي في الخصم (${formatPriceCompact(activePoi.low)} – ${formatPriceCompact(activePoi.high)}) لكن السعر لم يعد لاختباره بعد`;
    step4SummaryEn = `Found Bullish ${activePoi.kind} in Discount (${formatPriceCompact(activePoi.low)} – ${formatPriceCompact(activePoi.high)}) but price has not mitigated it yet`;
  } else {
    step4Score = 0;
    step4Status = "FAIL";
    rejections.add("NO_POI");
    step4SummaryAr = "لا يوجد Order Block شرائي أو فجوة FVG صالحة داخل منطقة الخصم في آخر 60 شمعة";
    step4SummaryEn = "No valid Bullish Order Block or FVG inside Discount Zone in last 60 candles";
  }

  // =========================================================================
  // STEP 5 (Weight 10): Displacement + Volume Confirmation
  // Search last 10 candles AND treat the structure-break candle itself as valid
  // Body >= 55% of range, Range >= 0.9 * ATR(14), Volume > 20-candle average
  // =========================================================================
  const volumes = entryCandles.map((c) => c.volume);
  const avgVol20 = sma(volumes.slice(0, -1), 20) || sma(volumes, 20) || 1;
  const dispWindowStart = Math.max(1, entryCandles.length - 10);

  const candidateDispIndices = new Set<number>();
  for (let i = dispWindowStart; i < entryCandles.length; i++) candidateDispIndices.add(i);
  if (structureBreak) {
    candidateDispIndices.add(structureBreak.candleIndex);
    if (structureBreak.candleIndex - 1 >= 0) candidateDispIndices.add(structureBreak.candleIndex - 1);
  }

  let bestDisplacement: {
    index: number;
    bodyPct: number;
    atrMult: number;
    volRatio: number;
  } | null = null;
  let maxRecentVolRatio = 0;

  for (const idx of Array.from(candidateDispIndices).sort((a, b) => b - a)) {
    const c = entryCandles[idx];
    if (!c) continue;
    const range = c.high - c.low;
    const body = c.close - c.open;
    const localAtr = atrs[idx] || atr;
    const localAvgVol =
      idx >= 20 ? sma(volumes.slice(idx - 20, idx), 20) || avgVol20 : avgVol20;
    const volRatio = localAvgVol > 0 ? c.volume / localAvgVol : 1;
    if (body > 0 && volRatio > maxRecentVolRatio) {
      maxRecentVolRatio = volRatio;
    }
    if (body > 0 && range > 0) {
      const bodyPct = (body / range) * 100;
      const atrMult = localAtr > 0 ? range / localAtr : 0;
      if (bodyPct >= 55 && atrMult >= 0.9) {
        if (!bestDisplacement || volRatio > bestDisplacement.volRatio) {
          bestDisplacement = { index: idx, bodyPct, atrMult, volRatio };
        }
      }
    }
  }

  const hasDisplacement = bestDisplacement !== null;
  const volRatioFinal = bestDisplacement
    ? Math.max(bestDisplacement.volRatio, maxRecentVolRatio)
    : maxRecentVolRatio;
  const hasVolumeConfirm = volRatioFinal >= 1.0;

  let step5Score = 0;
  let step5Status: StepEvaluation["status"] = "FAIL";
  let step5SummaryAr = "";
  let step5SummaryEn = "";

  if (hasDisplacement && hasVolumeConfirm && bestDisplacement) {
    step5Score = 10;
    step5Status = "PASS";
    step5SummaryAr = `إزاحة صاعدة قوية (جسم ${bestDisplacement.bodyPct.toFixed(0)}% ومدى ${bestDisplacement.atrMult.toFixed(2)}×ATR) مع حجم مؤكد ${volRatioFinal.toFixed(2)}× متوسط 20 شمعة`;
    step5SummaryEn = `Strong bullish displacement (body ${bestDisplacement.bodyPct.toFixed(0)}%, range ${bestDisplacement.atrMult.toFixed(2)}×ATR) with ${volRatioFinal.toFixed(2)}× 20-bar volume`;
    signalReasons.push({
      code: "DISPLACEMENT_VOLUME",
      labelAr: "إزاحة صاعدة + تأكيد حجم",
      labelEn: "Displacement + Volume",
      detail: `${bestDisplacement.atrMult.toFixed(2)}×ATR · ${volRatioFinal.toFixed(2)}×Vol`,
      points: 10,
    });
  } else if (hasDisplacement && !hasVolumeConfirm && bestDisplacement) {
    step5Score = 5;
    step5Status = "PARTIAL";
    rejections.add("NO_VOLUME_CONFIRMATION");
    step5SummaryAr = `تم رصد شمعة إزاحة (${bestDisplacement.bodyPct.toFixed(0)}% جسم، ${bestDisplacement.atrMult.toFixed(2)}×ATR) لكن الحجم ضعيف (${volRatioFinal.toFixed(2)}× أقل من متوسط 20 شمعة)`;
    step5SummaryEn = `Displacement detected (${bestDisplacement.bodyPct.toFixed(0)}% body, ${bestDisplacement.atrMult.toFixed(2)}×ATR) but volume weak (${volRatioFinal.toFixed(2)}× < 1.0× avg)`;
  } else if (!hasDisplacement && hasVolumeConfirm) {
    step5Score = 4;
    step5Status = "PARTIAL";
    rejections.add("NO_DISPLACEMENT");
    step5SummaryAr = `تأكيد حجم موجود (${volRatioFinal.toFixed(2)}× المتوسط) لكن بدون شمعة إزاحة صاعدة (جسم ≥ 55% ومدى ≥ 0.9×ATR)`;
    step5SummaryEn = `Volume above average (${volRatioFinal.toFixed(2)}×) but missing displacement candle (body ≥ 55%, range ≥ 0.9×ATR)`;
  } else {
    step5Score = 0;
    step5Status = "FAIL";
    rejections.add("NO_DISPLACEMENT");
    rejections.add("NO_VOLUME_CONFIRMATION");
    step5SummaryAr = `لا توجد شمعة إزاحة صاعدة قوية ولا تأكيد حجم (الحجم ${volRatioFinal.toFixed(2)}× متوسط 20 شمعة)`;
    step5SummaryEn = `No bullish displacement candle and volume below 20-bar average (${volRatioFinal.toFixed(2)}×)`;
  }

  // =========================================================================
  // TOTAL SCORE & TRADE PLAN CALCULATION
  // =========================================================================
  const totalScore = Math.min(
    100,
    step1Score + step2Score + step3Score + step4Score + step5Score + step6Score
  );

  // Determine Stop Loss reference low in strict priority order:
  // 1. Bullish OB low -> 2. Bullish FVG low -> 3. Swept SSL low -> 4. Nearest swing support
  let slRefPrice = levels.supports[0] ?? currentPrice - atr * 1.5;
  let slRefNameAr = "أقرب دعم هيكلي";
  let slRefNameEn = "Nearest Swing Support";

  if (bestOb && bestOb.low < currentPrice) {
    slRefPrice = bestOb.low;
    slRefNameAr = "قاع الـ Order Block الشرائي";
    slRefNameEn = "Bullish Order Block Low";
  } else if (bestFvg && bestFvg.low < currentPrice) {
    slRefPrice = bestFvg.low;
    slRefNameAr = "قاع فجوة FVG الشرائية";
    slRefNameEn = "Bullish FVG Low";
  } else if (sslSweep && sslSweep.wickLow < currentPrice) {
    slRefPrice = sslSweep.wickLow;
    slRefNameAr = "قاع سيولة البيع المكنوسة (SSL)";
    slRefNameEn = "Swept SSL Wick Low";
  }

  const slAtrBuffer = STRATEGY_RULES.SL_ATR_BUFFER * atr;
  const stopLoss = Math.max(slRefPrice - slAtrBuffer, currentPrice * 0.5);
  const entryPrice = currentPrice;
  const riskDistance = entryPrice - stopLoss;
  const slPercent = entryPrice > 0 ? -((riskDistance / entryPrice) * 100) : 0;
  const slAtrMultiple = atr > 0 ? riskDistance / atr : 0;

  // Compute TP1, TP2, TP3 using BSL / Resistances above entry mapped to 1R, 2R, 3R (capped at major resistances)
  const resistancesAbove = [
    ...levels.resistances,
    ...swingHighs.map((s) => s.price).filter((p) => p > entryPrice * 1.003),
  ]
    .filter((p) => p > entryPrice * 1.002)
    .sort((a, b) => a - b);

  const pickTarget = (
    rMult: number,
    minFloor: number
  ): { price: number; basisAr: string; basisEn: string } => {
    const rawR = entryPrice + riskDistance * rMult;
    const minByR = entryPrice + riskDistance * (rMult * 0.85);
    const maxByR = entryPrice + riskDistance * (rMult * 1.15);
    // Cap at nearby resistance/BSL pool inside [0.85R, 1.15R]
    const nearbyRes = resistancesAbove.find(
      (res) => res > minFloor && res >= minByR && res <= maxByR
    );
    if (nearbyRes) {
      return {
        price: nearbyRes,
        basisAr: `تجمع سيولة شرائية / مقاومة (${rMult}R مقصوص عند المقاومة)`,
        basisEn: `Buy-side liquidity / resistance (${rMult}R capped at resistance)`,
      };
    }
    return {
      price: Math.max(rawR, minFloor * 1.001),
      basisAr: `امتداد مخاطرة ${rMult}R نحو السيولة الشرائية`,
      basisEn: `${rMult}R Risk Extension toward Buy-side Liquidity`,
    };
  };

  let tradePlan: TradePlan | null = null;
  let rrTp2 = 0;

  if (riskDistance > 0 && entryPrice > 0) {
    const t1 = pickTarget(1, entryPrice * 1.002);
    const t2 = pickTarget(2, t1.price * 1.002);
    const t3 = pickTarget(3, t2.price * 1.002);

    const tp1 = t1.price;
    const tp2 = t2.price;
    const tp3 = t3.price;

    const tp1R = (tp1 - entryPrice) / riskDistance;
    const tp2R = (tp2 - entryPrice) / riskDistance;
    const tp3R = (tp3 - entryPrice) / riskDistance;
    rrTp2 = tp2R;

    const tp1Percent = ((tp1 - entryPrice) / entryPrice) * 100;
    const tp2Percent = ((tp2 - entryPrice) / entryPrice) * 100;
    const tp3Percent = ((tp3 - entryPrice) / entryPrice) * 100;

    const tradeSizeUsdt = STRATEGY_RULES.TRADE_SIZE_USDT; // STRICTLY 100 USDT
    const quantity = tradeSizeUsdt / entryPrice;
    // 0.1% entry fee + 0.1% exit fee + 0.05% slippage = 0.25%
    const estimatedFeesUsdt =
      tradeSizeUsdt * (STRATEGY_RULES.TOTAL_COST_PCT / 100);
    const grossProfitTp2 = quantity * (tp2 - entryPrice);
    const grossLossSl = quantity * (entryPrice - stopLoss);
    const expectedProfitTp2Usdt = grossProfitTp2 - estimatedFeesUsdt;
    const potentialLossUsdt = grossLossSl + estimatedFeesUsdt;

    const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
      Math.abs(slPercent) <= 2.5 && rrTp2 >= 2.0
        ? "LOW"
        : Math.abs(slPercent) <= 5.5
          ? "MEDIUM"
          : "HIGH";

    tradePlan = {
      entryPrice,
      entryReasonAr: activePoi
        ? `دخول Spot شراء عند السعر الحي بعد اختبار ${activePoi.kind === "OB" ? "Order Block" : "FVG"} في منطقة الخصم (${positionPct.toFixed(1)}%)`
        : `السعر الحي في منطقة ${positionPct <= 50 ? "الخصم" : "البريميم"} (${positionPct.toFixed(1)}%)`,
      entryReasonEn: activePoi
        ? `Spot Long entry at live price after ${activePoi.kind} mitigation in Discount (${positionPct.toFixed(1)}%)`
        : `Live price at ${positionPct.toFixed(1)}% of setup range`,
      stopLoss,
      slReferenceNameAr: slRefNameAr,
      slReferenceNameEn: slRefNameEn,
      slReferencePrice: slRefPrice,
      slAtrBuffer,
      slDistance: riskDistance,
      slPercent,
      slAtrMultiple,
      tp1,
      tp1Percent,
      tp1R,
      tp1BasisAr: t1.basisAr,
      tp1BasisEn: t1.basisEn,
      tp2,
      tp2Percent,
      tp2R,
      tp2BasisAr: t2.basisAr,
      tp2BasisEn: t2.basisEn,
      tp3,
      tp3Percent,
      tp3R,
      tp3BasisAr: t3.basisAr,
      tp3BasisEn: t3.basisEn,
      riskRewardTp2: rrTp2,
      riskLevel,
      tradeSizeUsdt,
      quantity,
      estimatedFeesUsdt,
      expectedProfitTp2Usdt,
      potentialLossUsdt,
      invalidationPrice: slRefPrice,
    };
  }

  // =========================================================================
  // HARD QUALITY GATES (Outside the 100-point score)
  // =========================================================================
  const scoreGatePassed = totalScore >= scoreThreshold;
  const volGatePassed = volume24hUsdt >= volumeThreshold;
  const spreadGatePassed = spreadPct <= spreadThreshold;
  const atrStopGatePassed = slAtrMultiple >= STRATEGY_RULES.MIN_STOP_ATR_MULT;
  const rrGatePassed = rrTp2 >= rrThreshold;
  const tp1PctActual = tradePlan?.tp1Percent ?? 0;
  const minProfitGatePassed =
    tp1PctActual >= STRATEGY_RULES.MIN_PROFIT_PCT &&
    (tradePlan?.expectedProfitTp2Usdt ?? 0) >= STRATEGY_RULES.MIN_PROFIT_PCT;

  if (!scoreGatePassed) rejections.add(strict ? "STRICT_SCORE_BELOW_70" : "SCORE_BELOW_THRESHOLD");
  if (!volGatePassed) rejections.add(strict ? "STRICT_VOLUME_LOW" : "LOW_LIQUIDITY_24H");
  if (!spreadGatePassed) rejections.add(strict ? "STRICT_SPREAD_HIGH" : "HIGH_SPREAD");
  if (!atrStopGatePassed) rejections.add("STOP_TOO_TIGHT");
  if (!rrGatePassed) rejections.add(strict ? "STRICT_RR_BELOW_2" : "RR_BELOW_MINIMUM");
  if (!minProfitGatePassed) rejections.add("PROFIT_BELOW_2PCT");

  // =========================================================================
  // OPTION B (strict) — additional entries-from-strong-zones criteria.
  // These only ever ADD rejections; Option A never sees them.
  // =========================================================================
  if (strict) {
    const allStepsPass = [step1Status, step2Status, step3Status, step4Status, step5Status, step6Status]
      .every((status) => status === "PASS");
    if (!allStepsPass) rejections.add("PARTIAL_STEP_NOT_ALLOWED");
    if (positionPct > STRATEGY_RULES.STRICT.DEEP_DISCOUNT_MAX_PCT) rejections.add("NOT_DEEP_DISCOUNT");
    if (!structureBreak || !structureBreak.afterSweep || structureBreak.type !== "CHoCH / MSS") {
      rejections.add("NO_CHOCH_AFTER_SWEEP");
    }
    if (!sslSweep || sslSweep.isInducement) rejections.add("INDUCEMENT_NOT_ENOUGH");
    const strictPoi = bestOb?.mitigated ? bestOb : bestFvg?.mitigated ? bestFvg : null;
    if (sslSweep && strictPoi) {
      const nearSweptLow = strictPoi.low <= sslSweep.wickLow + atr * STRATEGY_RULES.STRICT.MAX_POI_DISTANCE_ATR;
      if (!nearSweptLow || !strictPoi.recentTap) rejections.add("POI_NOT_NEAR_LOW");
    }
    const displacementOk =
      bestDisplacement !== null &&
      bestDisplacement.bodyPct >= STRATEGY_RULES.STRICT.MIN_BODY_PCT &&
      bestDisplacement.atrMult >= 0.9 &&
      volRatioFinal >= STRATEGY_RULES.STRICT.MIN_VOLUME_RATIO;
    if (!displacementOk) rejections.add("STRICT_DISPLACEMENT");
  }

  const qualityGates: QualityGateResult[] = [
    {
      key: "SCORE",
      labelAr: "حد درجة الإعداد",
      labelEn: "Setup Score Threshold",
      passed: scoreGatePassed,
      actualDisplay: `${totalScore} / 100`,
      thresholdDisplay: `≥ ${scoreThreshold}`,
    },
    {
      key: "MIN_PROFIT",
      labelAr: "الحد الأدنى للربح (TP1 ≥ 2%)",
      labelEn: "Minimum Profit Gate (TP1 ≥ 2%)",
      passed: minProfitGatePassed,
      actualDisplay: `+${tp1PctActual.toFixed(2)}%`,
      thresholdDisplay: `≥ +${STRATEGY_RULES.MIN_PROFIT_PCT.toFixed(1)}%`,
    },
    ...(strict
      ? [
          {
            key: "ZONE_DEPTH" as const,
            labelAr: "عمق منطقة الخصم (وضع B)",
            labelEn: "Deep Discount Depth (Option B)",
            passed: positionPct <= STRATEGY_RULES.STRICT.DEEP_DISCOUNT_MAX_PCT,
            actualDisplay: `${positionPct.toFixed(1)}%`,
            thresholdDisplay: `≤ ${STRATEGY_RULES.STRICT.DEEP_DISCOUNT_MAX_PCT}%`,
          },
        ]
      : []),
    {
      key: "RR",
      labelAr: "العائد إلى المخاطرة (TP2)",
      labelEn: "Risk : Reward (to TP2)",
      passed: rrGatePassed,
      actualDisplay: `${rrTp2.toFixed(2)}R`,
      thresholdDisplay: `≥ ${rrThreshold}R`,
    },
    {
      key: "VOLUME_24H",
      labelAr: "سيولة 24 ساعة (Spot)",
      labelEn: "24h Spot Liquidity",
      passed: volGatePassed,
      actualDisplay: `$${formatCompactVolume(volume24hUsdt)}`,
      thresholdDisplay: `≥ $${formatCompactVolume(volumeThreshold)}`,
    },
    {
      key: "SPREAD",
      labelAr: "السبريد الحي (Bid/Ask)",
      labelEn: "Live Bid-Ask Spread",
      passed: spreadGatePassed,
      actualDisplay: `${spreadPct.toFixed(3)}%`,
      thresholdDisplay: `≤ ${spreadThreshold}%`,
    },
    {
      key: "ATR_STOP",
      labelAr: "اتساع الوقف (نسبي لـ ATR)",
      labelEn: "ATR-Relative Stop Width",
      passed: atrStopGatePassed,
      actualDisplay: `${slAtrMultiple.toFixed(2)}×ATR`,
      thresholdDisplay: `≥ ${STRATEGY_RULES.MIN_STOP_ATR_MULT}×ATR`,
    },
  ];

  // Strict qualification: ZERO rejections, mode threshold, profit >= 2%, valid trade plan!
  const qualified =
    rejections.size === 0 &&
    scoreGatePassed &&
    minProfitGatePassed &&
    volGatePassed &&
    spreadGatePassed &&
    atrStopGatePassed &&
    rrGatePassed &&
    tradePlan !== null;

  const grade: SmcAnalysisResult["grade"] = !qualified
    ? "NONE"
    : totalScore >= 82
      ? "A+"
      : totalScore >= 70
        ? "A"
        : "B";

  // =========================================================================
  // 5-FACTOR CONFLUENCE LAYER (CONTEXT ONLY — ZERO POINTS ADDED)
  // =========================================================================
  const indicatorsByTimeframe: ClassicalIndicators[] = [];
  let bullishTfCount = 0;
  let totalTfChecked = 0;

  if (allTfCandles) {
    for (const tf of ALL_TIMEFRAMES) {
      const c = allTfCandles[tf];
      if (c && c.length >= 20) {
        const ind = computeClassicalIndicators(tf, c);
        indicatorsByTimeframe.push(ind);
        totalTfChecked++;
        if (ind.trendLabel === "BULLISH") bullishTfCount++;
      }
    }
  } else {
    indicatorsByTimeframe.push(entryIndicators);
    if (timeframe !== "4h") indicatorsByTimeframe.push(h4Indicators);
    if (timeframe !== "1d") indicatorsByTimeframe.push(dailyIndicators);
    totalTfChecked = indicatorsByTimeframe.length;
    bullishTfCount = indicatorsByTimeframe.filter((i) => i.trendLabel === "BULLISH").length;
  }

  // Factor 2: Entry candle confirmation (Bullish Engulfing or Bullish Pin Bar in last 3 candles)
  let entryCandlePatternAr = "لا توجد شمعة ابتلاع أو Pin Bar صاعد في آخر 3 شموع";
  let entryCandlePatternEn = "No Bullish Engulfing or Pin Bar in last 3 candles";
  let entryCandleBullish = false;

  const recent3 = entryCandles.slice(-3);
  for (let idx = 1; idx < recent3.length; idx++) {
    const prev = recent3[idx - 1];
    const curr = recent3[idx];
    const body = curr.close - curr.open;
    const range = curr.high - curr.low;
    const lowerWick = Math.min(curr.open, curr.close) - curr.low;
    const upperWick = curr.high - Math.max(curr.open, curr.close);
    const isEngulfing =
      prev.close < prev.open &&
      curr.close > curr.open &&
      curr.close >= prev.open &&
      curr.open <= prev.close;
    const isPinBar =
      range > 0 &&
      lowerWick >= range * 0.55 &&
      upperWick <= range * 0.25 &&
      curr.close >= curr.open * 0.998;

    if (isEngulfing) {
      entryCandleBullish = true;
      entryCandlePatternAr = "شمعة ابتلاع شرائي (Bullish Engulfing) مؤكّدة في آخر 3 شموع";
      entryCandlePatternEn = "Confirmed Bullish Engulfing candle in last 3 bars";
      break;
    }
    if (isPinBar) {
      entryCandleBullish = true;
      entryCandlePatternAr = "شمعة رفض قاع (Bullish Pin Bar) بذيل سفلي طويل في آخر 3 شموع";
      entryCandlePatternEn = "Confirmed Bullish Pin Bar bottom rejection in last 3 bars";
      break;
    }
    if (body > 0 && range > 0 && body / range >= 0.65) {
      entryCandlePatternAr = "شمعة صاعدة قوية الزخم في آخر 3 شموع";
      entryCandlePatternEn = "Strong bullish momentum bar in last 3 bars";
    }
  }

  // Factor 3: Volume Profile (POC + 70% Value Area) + OBV
  const vp = computeVolumeProfile(entryCandles, 24);
  const vpBullish = currentPrice >= vp.val && entryIndicators.obvTrend === "UP";

  // Factor 4: BTC Macro Regime
  const btcBullish =
    btcContext.btcDailyTrend === "BULLISH" || btcContext.riskRegime === "RISK_ON";

  // Factor 5: Session / Killzone
  const kzActive = btcContext.killzoneActive;

  const confluenceFactors: ConfluenceFactor[] = [
    {
      key: "MTF_ALIGNMENT",
      labelAr: "توافق الفريمات الستة",
      labelEn: "6-Timeframe Alignment",
      status:
        bullishTfCount >= Math.ceil(totalTfChecked * 0.6)
          ? "BULLISH"
          : bullishTfCount >= Math.ceil(totalTfChecked * 0.35)
            ? "NEUTRAL"
            : "BEARISH",
      detailAr: `${bullishTfCount} من ${totalTfChecked} فريمات صاعدة`,
      detailEn: `${bullishTfCount} of ${totalTfChecked} timeframes bullish`,
    },
    {
      key: "ENTRY_CANDLE",
      labelAr: "تأكيد شمعة الدخول",
      labelEn: "Entry Candle Confirmation",
      status: entryCandleBullish ? "BULLISH" : "NEUTRAL",
      detailAr: entryCandlePatternAr,
      detailEn: entryCandlePatternEn,
    },
    {
      key: "VOLUME_PROFILE_OBV",
      labelAr: "بروفايل الحجم (POC / VA70%) + OBV",
      labelEn: "Volume Profile (POC / 70% VA) + OBV",
      status: vpBullish
        ? "BULLISH"
        : entryIndicators.obvTrend === "DOWN"
          ? "BEARISH"
          : "NEUTRAL",
      detailAr: `POC ${formatPriceCompact(vp.poc)} · VA70% [${formatPriceCompact(vp.val)}–${formatPriceCompact(vp.vah)}] · OBV ${entryIndicators.obvTrend === "UP" ? "صاعد" : entryIndicators.obvTrend === "DOWN" ? "هابط" : "محايد"}`,
      detailEn: `POC ${formatPriceCompact(vp.poc)} · 70% VA [${formatPriceCompact(vp.val)}–${formatPriceCompact(vp.vah)}] · OBV ${entryIndicators.obvTrend}`,
    },
    {
      key: "BTC_REGIME",
      labelAr: "نظام BTC العام",
      labelEn: "BTC Macro Regime",
      status: btcBullish
        ? "BULLISH"
        : btcContext.btcDailyTrend === "BEARISH"
          ? "BEARISH"
          : "NEUTRAL",
      detailAr: `BTC ${btcContext.btcDailyTrend === "BULLISH" ? "صاعد" : btcContext.btcDailyTrend === "BEARISH" ? "هابط" : "محايد"} (${btcContext.btcChange24h >= 0 ? "+" : ""}${btcContext.btcChange24h.toFixed(2)}%) · ${btcContext.riskRegime === "RISK_ON" ? "Risk-On" : btcContext.riskRegime === "RISK_OFF" ? "Risk-Off" : "متوازن"}`,
      detailEn: `BTC ${btcContext.btcDailyTrend} (${btcContext.btcChange24h >= 0 ? "+" : ""}${btcContext.btcChange24h.toFixed(2)}%) · ${btcContext.riskRegime}`,
    },
    {
      key: "SESSION_KILLZONE",
      labelAr: "الجلسة والـ Killzone",
      labelEn: "Session & Killzone",
      status: kzActive ? "BULLISH" : "NEUTRAL",
      detailAr: `${btcContext.sessionAr} — ${btcContext.killzoneNameAr}`,
      detailEn: `${btcContext.sessionEn} — ${btcContext.killzoneNameEn}`,
    },
  ];

  const bullishConfluenceCount = confluenceFactors.filter(
    (f) => f.status === "BULLISH"
  ).length;
  const confluenceRating: "STRONG" | "GOOD" | "WEAK" =
    bullishConfluenceCount >= 4
      ? "STRONG"
      : bullishConfluenceCount >= 2
        ? "GOOD"
        : "WEAK";

  // Build numbered 6 steps in exact strategy order
  const steps: StepEvaluation[] = [
    {
      stepNumber: 1,
      key: "HTF_BIAS",
      titleAr: "انحياز الفريم الأعلى ودعم القاع (1d + 4h)",
      titleEn: "Higher-Timeframe Bias & Bottom Support (1d + 4h)",
      weight: STRATEGY_RULES.WEIGHTS.HTF_BIAS,
      score: step1Score,
      status: step1Status,
      summaryAr: step1SummaryAr,
      summaryEn: step1SummaryEn,
      metrics: {
        d1Close: formatPriceCompact(d1Last),
        d1Ema20: formatPriceCompact(d1E20),
        d1Ema50: formatPriceCompact(d1E50),
        d1Rsi: Number(d1Rsi.toFixed(1)),
        h4Close: formatPriceCompact(h4Last),
        h4Ema20: formatPriceCompact(h4E20),
        h4Ema50: formatPriceCompact(h4E50),
        h4Rsi: Number(h4Rsi.toFixed(1)),
      },
    },
    {
      stepNumber: 2,
      key: "LIQUIDITY_SWEEP",
      titleAr: "كنس سيولة البيع عند القاع (SSL / Inducement)",
      titleEn: "Sell-side Liquidity Sweep (SSL / Inducement)",
      weight: STRATEGY_RULES.WEIGHTS.LIQUIDITY_SWEEP,
      score: step2Score,
      status: step2Status,
      summaryAr: step2SummaryAr,
      summaryEn: step2SummaryEn,
      metrics: {
        sweptLevel: sslSweep ? formatPriceCompact(sslSweep.sweptLevel) : null,
        wickLow: sslSweep ? formatPriceCompact(sslSweep.wickLow) : null,
        type: sslSweep
          ? sslSweep.isInducement
            ? "Inducement"
            : sslSweep.isEqualLows
              ? "Equal Lows SSL"
              : "Swing Low SSL"
          : "None",
        nearestSslPool: formatPriceCompact(nearestSslPool),
        nearestBslPool: formatPriceCompact(nearestBslPool),
        bslSweptSeparately: bslSweepLevel ? formatPriceCompact(bslSweepLevel) : null,
      },
    },
    {
      stepNumber: 3,
      key: "STRUCTURE_SHIFT",
      titleAr: "كسر البنية الصاعد بعد القاع (CHoCH / MSS / BOS)",
      titleEn: "Bullish Structure Shift (CHoCH / MSS / BOS)",
      weight: STRATEGY_RULES.WEIGHTS.STRUCTURE_SHIFT,
      score: step3Score,
      status: step3Status,
      summaryAr: step3SummaryAr,
      summaryEn: step3SummaryEn,
      metrics: {
        breakType: structureBreak?.type ?? "None",
        brokenLevel: structureBreak ? formatPriceCompact(structureBreak.brokenLevel) : null,
        breakClose: structureBreak ? formatPriceCompact(structureBreak.breakClose) : null,
        afterSweep: structureBreak?.afterSweep ?? false,
      },
    },
    {
      stepNumber: 4,
      key: "POI_MITIGATION",
      titleAr: "اختبار منطقة الاهتمام في الخصم (Order Block / FVG)",
      titleEn: "POI Mitigation in Discount (Order Block / FVG)",
      weight: STRATEGY_RULES.WEIGHTS.POI_MITIGATION,
      score: step4Score,
      status: step4Status,
      summaryAr: step4SummaryAr,
      summaryEn: step4SummaryEn,
      metrics: {
        obRange: bestOb
          ? `${formatPriceCompact(bestOb.low)} – ${formatPriceCompact(bestOb.high)}`
          : null,
        fvgRange: bestFvg
          ? `${formatPriceCompact(bestFvg.low)} – ${formatPriceCompact(bestFvg.high)}`
          : null,
        mitigated: activePoi?.mitigated ?? false,
        inDiscount: activePoi?.inDiscount ?? false,
      },
    },
    {
      stepNumber: 5,
      key: "DISPLACEMENT_VOLUME",
      titleAr: "الإزاحة الصاعدة وتأكيد الحجم",
      titleEn: "Bullish Displacement & Volume Confirmation",
      weight: STRATEGY_RULES.WEIGHTS.DISPLACEMENT_VOLUME,
      score: step5Score,
      status: step5Status,
      summaryAr: step5SummaryAr,
      summaryEn: step5SummaryEn,
      metrics: {
        bodyPct: bestDisplacement ? `${bestDisplacement.bodyPct.toFixed(1)}%` : "—",
        rangeAtrMult: bestDisplacement ? `${bestDisplacement.atrMult.toFixed(2)}×ATR` : "—",
        volumeRatio: `${volRatioFinal.toFixed(2)}×Avg20`,
        atr14: formatPriceCompact(atr),
      },
    },
    {
      stepNumber: 6,
      key: "DISCOUNT_ZONE",
      titleAr: "منطقة الخصم العميق وخطة الصفقة",
      titleEn: "Bottom Discount Zone & Trade Plan",
      weight: STRATEGY_RULES.WEIGHTS.DISCOUNT_ZONE,
      score: step6Score,
      status: step6Status,
      summaryAr: step6SummaryAr,
      summaryEn: step6SummaryEn,
      metrics: {
        rangeLow: formatPriceCompact(rangeLow),
        rangeHigh: formatPriceCompact(rangeHigh),
        equilibrium: formatPriceCompact(equilibrium),
        positionPct: `${positionPct.toFixed(1)}%`,
        zone: discountZoneType,
        source: discountSource,
      },
    },
  ];

  const passedStepsCount = steps.filter((s) => s.status === "PASS").length;
  const rejectionReasons = Array.from(rejections).map((code) => ({
    code,
    labelAr: REJECTION_CATALOG[code]?.ar ?? code,
    labelEn: REJECTION_CATALOG[code]?.en ?? code,
  }));

  const scenarios = {
    bullishAr: tradePlan
      ? `استمرار الثبات فوق ${formatPriceCompact(tradePlan.invalidationPrice)} مع زخم شرائي يستهدف السيولة عند ${formatPriceCompact(tradePlan.tp1)} ثم ${formatPriceCompact(tradePlan.tp2)} وامتدادًا نحو ${formatPriceCompact(tradePlan.tp3)}.`
      : `مراقبة تشكل كنس لسيولة البيع أسفل ${formatPriceCompact(nearestSslPool)} متبوعًا بإغلاق فوق ${formatPriceCompact(nearestBslPool)} لتفعيل إعداد اصطياد قاع مؤهل.`,
    bullishEn: tradePlan
      ? `Holding above ${formatPriceCompact(tradePlan.invalidationPrice)} with bullish follow-through targets buy-side liquidity at ${formatPriceCompact(tradePlan.tp1)}, ${formatPriceCompact(tradePlan.tp2)}, and ${formatPriceCompact(tradePlan.tp3)}.`
      : `Watch for a sell-side liquidity sweep below ${formatPriceCompact(nearestSslPool)} followed by a bullish close above ${formatPriceCompact(nearestBslPool)} to form a valid bottom-hunt setup.`,
    bearishAr: `إغلاق شمعة أسفل ${formatPriceCompact(slRefPrice)} يُبطل بنية اصطياد القاع تمامًا (إبطال ICT) ويفتح المجال لاختبار السيولة الأدنى عند ${formatPriceCompact(levels.supports[1] ?? stopLoss * 0.97)}.`,
    bearishEn: `A candle close below ${formatPriceCompact(slRefPrice)} triggers full ICT invalidation and exposes lower liquidity near ${formatPriceCompact(levels.supports[1] ?? stopLoss * 0.97)}.`,
  };

  return {
    symbol: pair.symbol,
    baseAsset: pair.baseAsset,
    exchange: pair.exchange,
    marketType: pair.marketType,
    sector: pair.sector,
    timeframe,
    entryMode: strict ? "B" : "A",
    analyzedAt,
    currentPrice,
    priceChange24h,
    volume24hUsdt,
    high24h,
    low24h,
    spreadPct,
    qualified,
    score: totalScore,
    threshold: scoreThreshold,
    scoreGap: Math.max(0, scoreThreshold - totalScore),
    grade,
    passedStepsCount,
    steps,
    rejectionReasons,
    signalReasons,
    qualityGates,
    discountRange: {
      source: discountSource,
      low: rangeLow,
      high: rangeHigh,
      equilibrium,
      positionPct,
      zone: discountZoneType,
    },
    zones,
    tradePlan,
    confluence: {
      rating: confluenceRating,
      bullishCount: bullishConfluenceCount,
      factors: confluenceFactors,
      disclaimerAr:
        "طبقة التوافق للمعلومات والسياق فقط — لا تضيف أي نقاط للدرجة ولا تغيّر قرار التأهل أبدًا.",
      disclaimerEn:
        "Confluence layer is informational context only — adds ZERO points and NEVER changes qualification.",
    },
    indicatorsByTimeframe,
    levels,
    scenarios,
    btcContext,
  };
}

function formatCompactVolume(v: number): string {
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}
