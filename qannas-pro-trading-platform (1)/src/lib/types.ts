export type ExchangeId = "BINANCE" | "MEXC";
export type MarketType = "CRYPTO" | "STOCK";
export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";
export type EntryMode = "A" | "B";
export type Language = "ar" | "en";

export const ALL_TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1h", "4h", "1d"];

export const TIMEFRAME_RANK: Record<Timeframe, number> = {
  "1m": 1,
  "5m": 2,
  "15m": 3,
  "1h": 4,
  "4h": 5,
  "1d": 6,
};

export const TIMEFRAME_PRESETS: Record<
  "fast" | "balanced" | "swing" | "all",
  { labelAr: string; labelEn: string; timeframes: Timeframe[] }
> = {
  fast: {
    labelAr: "سريع",
    labelEn: "Fast",
    timeframes: ["1m", "5m", "15m"],
  },
  balanced: {
    labelAr: "متوازن",
    labelEn: "Balanced",
    timeframes: ["15m", "1h", "4h"],
  },
  swing: {
    labelAr: "سوينج",
    labelEn: "Swing",
    timeframes: ["1h", "4h", "1d"],
  },
  all: {
    labelAr: "كل الفريمات الستة",
    labelEn: "All 6 Timeframes",
    timeframes: ["1m", "5m", "15m", "1h", "4h", "1d"],
  },
};

export const STRATEGY_RULES = {
  NAME_AR: "SMC / ICT — اصطياد القاع (شراء Spot فقط)",
  NAME_EN: "SMC / ICT — Bottom Hunting (Spot Long Only)",
  SCORE_THRESHOLD: 58,
  TOTAL_WEIGHT: 100,
  TRADE_SIZE_USDT: 100,
  FEE_PER_SIDE_PCT: 0.1, // 0.1% each side
  SLIPPAGE_PCT: 0.05, // 0.05% slippage
  TOTAL_COST_PCT: 0.25, // 0.1% + 0.1% + 0.05%
  MIN_RR_TP2: 1.5,
  MIN_PROFIT_PCT: 2.0, // Minimum 2% profit required on TP1 (and net TP2 >= $2)
  MIN_STOP_ATR_MULT: 0.3,
  SL_ATR_BUFFER: 0.25,
  MIN_VOLUME_24H_USDT: 100_000,
  MAX_SPREAD_PCT: 0.65,
  SIGNAL_EXPIRY_MINUTES: 60,
  // OPTION B — strict entry criteria. Option A above stays exactly as it is.
  STRICT: {
    SCORE: 70,
    DEEP_DISCOUNT_MAX_PCT: 35,
    MIN_RR_TP2: 2.0,
    MIN_VOLUME_24H_USDT: 250_000,
    MAX_SPREAD_PCT: 0.4,
    MIN_VOLUME_RATIO: 1.5,
    MIN_BODY_PCT: 65,
    MAX_POI_DISTANCE_ATR: 2,
  },
  WEIGHTS: {
    HTF_BIAS: 25,
    LIQUIDITY_SWEEP: 20,
    STRUCTURE_SHIFT: 20,
    POI_MITIGATION: 15,
    DISPLACEMENT_VOLUME: 10,
    DISCOUNT_ZONE: 10,
  },
} as const;

export const REJECTION_CATALOG: Record<
  string,
  { ar: string; en: string; category: "SEQUENCE" | "GATE" | "DATA" }
> = {
  HTF_BIAS_BEARISH: {
    ar: "انحياز الفريم الأعلى هابط دون تماسك قاع (1d + 4h)",
    en: "Higher-timeframe bias bearish without bottom stabilization (1d + 4h)",
    category: "SEQUENCE",
  },
  NO_LIQUIDITY_SWEEP: {
    ar: "لا يوجد كنس لسيولة البيع (SSL) أو Inducement عند القاع في آخر 30 شمعة",
    en: "No sell-side liquidity sweep (SSL) or bottom inducement in last 30 candles",
    category: "SEQUENCE",
  },
  NO_STRUCTURE_SHIFT: {
    ar: "لم يحدث كسر بنية صاعد (CHoCH / MSS / BOS) في آخر 40 شمعة",
    en: "No bullish structure shift (CHoCH / MSS / BOS) in last 40 candles",
    category: "SEQUENCE",
  },
  NO_POI: {
    ar: "لا توجد منطقة اهتمام شرائية (Order Block أو FVG) في منطقة الخصم خلال آخر 60 شمعة",
    en: "No bullish Order Block or FVG inside Discount Zone in last 60 candles",
    category: "SEQUENCE",
  },
  POI_NOT_MITIGATED: {
    ar: "السعر لم يعد لاختبار منطقة الاهتمام (Order Block / FVG) بعد",
    en: "Price has not returned to mitigate the Order Block / FVG yet",
    category: "SEQUENCE",
  },
  PREMIUM_ZONE: {
    ar: "السعر في منطقة البريميم (فوق 50% من مدى الإعداد) — غير مناسب لاصطياد القاع",
    en: "Price is in Premium Zone (>50% of setup leg) — invalid for bottom hunting",
    category: "SEQUENCE",
  },
  NOT_IN_DISCOUNT: {
    ar: "السعر خارج منطقة الخصم (أعلى من حد التوازن 50%)",
    en: "Price is outside Discount Zone (above 50% equilibrium)",
    category: "SEQUENCE",
  },
  NO_DISPLACEMENT: {
    ar: "غياب شمعة إزاحة صاعدة قوية (جسم ≥ 55% ومدى ≥ 0.9×ATR)",
    en: "No strong bullish displacement candle (body ≥ 55% and range ≥ 0.9×ATR)",
    category: "SEQUENCE",
  },
  NO_VOLUME_CONFIRMATION: {
    ar: "الحجم غير مؤكد (أقل من متوسط 20 شمعة)",
    en: "No volume confirmation (below 20-candle average)",
    category: "SEQUENCE",
  },
  SCORE_BELOW_THRESHOLD: {
    ar: "الدرجة الكلية أقل من حد التأهل الصارم (58/100)",
    en: "Total setup score is below strict 58/100 qualification threshold",
    category: "GATE",
  },
  LOW_LIQUIDITY_24H: {
    ar: "سيولة 24 ساعة أقل من الحد الأدنى المطلوب (100,000 USDT)",
    en: "24h quote volume below minimum liquidity gate (100,000 USDT)",
    category: "GATE",
  },
  HIGH_SPREAD: {
    ar: "السبريد بين العرض والطلب يتجاوز الحد المسموح (0.65%)",
    en: "Bid-ask spread exceeds maximum allowed gate (0.65%)",
    category: "GATE",
  },
  RR_BELOW_MINIMUM: {
    ar: "نسبة العائد إلى المخاطرة حتى الهدف الثاني أقل من 1.5",
    en: "Risk-to-Reward to TP2 is below 1.5 minimum gate",
    category: "GATE",
  },
  PROFIT_BELOW_2PCT: {
    ar: "ربح الصفقة (الهدف الأول TP1) أقل من الحد الأدنى المطلوب 2%",
    en: "Trade profit (TP1) is below the strict 2.0% minimum gate",
    category: "GATE",
  },
  STRICT_SCORE_BELOW_70: {
    ar: "وضع B الصارم: الدرجة أقل من حد 70/100",
    en: "Strict Option B: score below the 70/100 threshold",
    category: "GATE",
  },
  PARTIAL_STEP_NOT_ALLOWED: {
    ar: "وضع B الصارم: خطوة من الخطوات الستة غير مستوفاة بالكامل (لا يُقبل جزئي)",
    en: "Strict Option B: one of the six steps is only partial (partials rejected)",
    category: "GATE",
  },
  NOT_DEEP_DISCOUNT: {
    ar: "وضع B الصارم: السعر ليس في خصم عميق (يجب ≤ 35% من المدى وليس 50%)",
    en: "Strict Option B: not in deep discount (must be ≤ 35% of the range, not 50%)",
    category: "SEQUENCE",
  },
  NO_CHOCH_AFTER_SWEEP: {
    ar: "وضع B الصارم: لا يوجد CHoCH/MSS صاعد بعد كنس السيولة مباشرة",
    en: "Strict Option B: no bullish CHoCH/MSS immediately after the liquidity sweep",
    category: "SEQUENCE",
  },
  INDUCEMENT_NOT_ENOUGH: {
    ar: "وضع B الصارم: كنس Inducement وحده لا يكفي — يلزم كنس سيولة بيع SSL حقيقي",
    en: "Strict Option B: an inducement sweep alone is insufficient — a real SSL sweep is required",
    category: "SEQUENCE",
  },
  POI_NOT_NEAR_LOW: {
    ar: "وضع B الصارم: منطقة الاهتمام ليست حديثة الزيارة ولا قريبة من قاع السيولة المكنوس",
    en: "Strict Option B: the POI is not recently mitigated near the swept liquidity low",
    category: "SEQUENCE",
  },
  STRICT_DISPLACEMENT: {
    ar: "وضع B الصارم: الإزاحة/الحجم دون الحدود (جسم ≥65% وحجم ≥1.5× المتوسط)",
    en: "Strict Option B: displacement/volume below thresholds (body ≥65%, volume ≥1.5× average)",
    category: "GATE",
  },
  STRICT_RR_BELOW_2: {
    ar: "وضع B الصارم: العائد إلى المخاطرة حتى TP2 أقل من 2.0R",
    en: "Strict Option B: risk-to-reward to TP2 below 2.0R",
    category: "GATE",
  },
  STRICT_SPREAD_HIGH: {
    ar: "وضع B الصارم: السبريد أعلى من 0.40%",
    en: "Strict Option B: spread above 0.40%",
    category: "GATE",
  },
  STRICT_VOLUME_LOW: {
    ar: "وضع B الصارم: سيولة 24 ساعة أقل من 250,000 USDT",
    en: "Strict Option B: 24h liquidity below 250,000 USDT",
    category: "GATE",
  },
  STOP_TOO_TIGHT: {
    ar: "مسافة وقف الخسارة أضيق من 0.3×ATR على فريم الدخول",
    en: "Stop-loss distance is tighter than 0.3×ATR on entry timeframe",
    category: "GATE",
  },
  INSUFFICIENT_CANDLES: {
    ar: "عدد الشموع المتوفرة غير كافٍ للتحليل الكامل",
    en: "Insufficient candle history for complete SMC analysis",
    category: "DATA",
  },
};

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface DiscoveredPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: "USDT";
  exchange: ExchangeId;
  marketType: MarketType;
  sector: string;
  fullName?: string;
  firstOpenTime?: number;
}

export interface Ticker24h {
  symbol: string;
  exchange: ExchangeId;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  quoteVolume: number;
  volume: number;
  bidPrice: number;
  askPrice: number;
  spreadPct: number;
}

export interface ExchangeStatusInfo {
  exchange: ExchangeId;
  connected: boolean;
  hostUsed: string;
  pairCount: number;
  cryptoCount: number;
  stockCount: number;
  latencyMs: number;
  lastUpdated: string;
  error: string | null;
}

export interface ZoneBox {
  type: "OB" | "FVG";
  low: number;
  high: number;
  startTime: number;
  endTime: number;
  mitigated: boolean;
  inDiscount: boolean;
  label: string;
}

export interface StepEvaluation {
  stepNumber: 1 | 2 | 3 | 4 | 5 | 6;
  key: string;
  titleAr: string;
  titleEn: string;
  weight: number;
  score: number;
  status: "PASS" | "PARTIAL" | "FAIL";
  summaryAr: string;
  summaryEn: string;
  metrics: Record<string, string | number | boolean | null>;
}

export interface QualityGateResult {
  key: "SCORE" | "RR" | "MIN_PROFIT" | "ZONE_DEPTH" | "VOLUME_24H" | "SPREAD" | "ATR_STOP";
  labelAr: string;
  labelEn: string;
  passed: boolean;
  actualDisplay: string;
  thresholdDisplay: string;
}

export interface ConfluenceFactor {
  key: string;
  labelAr: string;
  labelEn: string;
  status: "BULLISH" | "NEUTRAL" | "BEARISH";
  detailAr: string;
  detailEn: string;
}

export interface ClassicalIndicators {
  timeframe: Timeframe;
  price: number;
  ema20: number;
  ema50: number;
  ema200: number | null;
  rsi14: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  atr14: number;
  atrPct: number;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  vwap: number;
  adx14: number;
  obv: number;
  obvTrend: "UP" | "DOWN" | "FLAT";
  stochRsiK: number;
  stochRsiD: number;
  trendLabel: "BULLISH" | "BEARISH" | "NEUTRAL";
}

export interface SupportResistanceData {
  supports: number[];
  resistances: number[];
  pivot: {
    pp: number;
    r1: number;
    r2: number;
    r3: number;
    s1: number;
    s2: number;
    s3: number;
  };
  fibonacci: {
    swingLow: number;
    swingHigh: number;
    fib236: number;
    fib382: number;
    fib500: number;
    fib618: number;
    fib786: number;
  };
}

export interface TradePlan {
  entryPrice: number;
  entryReasonAr: string;
  entryReasonEn: string;
  stopLoss: number;
  slReferenceNameAr: string;
  slReferenceNameEn: string;
  slReferencePrice: number;
  slAtrBuffer: number;
  slDistance: number;
  slPercent: number;
  slAtrMultiple: number;
  tp1: number;
  tp1Percent: number;
  tp1R: number;
  tp1BasisAr: string;
  tp1BasisEn: string;
  tp2: number;
  tp2Percent: number;
  tp2R: number;
  tp2BasisAr: string;
  tp2BasisEn: string;
  tp3: number;
  tp3Percent: number;
  tp3R: number;
  tp3BasisAr: string;
  tp3BasisEn: string;
  riskRewardTp2: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  tradeSizeUsdt: number;
  quantity: number;
  estimatedFeesUsdt: number;
  expectedProfitTp2Usdt: number;
  potentialLossUsdt: number;
  invalidationPrice: number;
}

export interface SmcAnalysisResult {
  symbol: string;
  baseAsset: string;
  exchange: ExchangeId;
  marketType: MarketType;
  sector: string;
  timeframe: Timeframe;
  entryMode: EntryMode;
  analyzedAt: string;
  currentPrice: number;
  priceChange24h: number;
  volume24hUsdt: number;
  high24h: number;
  low24h: number;
  spreadPct: number;
  qualified: boolean;
  score: number;
  threshold: number;
  scoreGap: number;
  grade: "A+" | "A" | "B" | "NONE";
  passedStepsCount: number;
  steps: StepEvaluation[];
  rejectionReasons: Array<{
    code: string;
    labelAr: string;
    labelEn: string;
  }>;
  signalReasons: Array<{
    code: string;
    labelAr: string;
    labelEn: string;
    detail: string;
    points: number;
  }>;
  qualityGates: QualityGateResult[];
  discountRange: {
    source: "SETUP_LEG" | "FALLBACK_90";
    low: number;
    high: number;
    equilibrium: number;
    positionPct: number;
    zone: "DEEP_DISCOUNT" | "DISCOUNT" | "PREMIUM";
  };
  zones: ZoneBox[];
  tradePlan: TradePlan | null;
  confluence: {
    rating: "STRONG" | "GOOD" | "WEAK";
    bullishCount: number;
    factors: ConfluenceFactor[];
    disclaimerAr: string;
    disclaimerEn: string;
  };
  indicatorsByTimeframe: ClassicalIndicators[];
  levels: SupportResistanceData;
  scenarios: {
    bullishAr: string;
    bullishEn: string;
    bearishAr: string;
    bearishEn: string;
  };
  btcContext: MarketContext;
  qualifiedTimeframes?: Timeframe[];
}

export interface MarketContext {
  btcPrice: number;
  btcChange24h: number;
  btcDailyTrend: "BULLISH" | "BEARISH" | "NEUTRAL";
  riskRegime: "RISK_ON" | "RISK_OFF" | "NEUTRAL";
  sessionAr: string;
  sessionEn: string;
  killzoneActive: boolean;
  killzoneNameAr: string;
  killzoneNameEn: string;
  utcHour: number;
  updatedAt: string;
}
