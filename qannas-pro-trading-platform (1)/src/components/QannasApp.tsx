"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Bell,
  Briefcase,
  CheckCheck,
  Coins,
  Compass,
  Crosshair,
  Globe,
  Layers,
  Play,
  Radar,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Square,
  Star,
  TrendingDown,
  TrendingUp,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Building2,
} from "lucide-react";
import {
  ALL_TIMEFRAMES,
  Candle,
  ExchangeId,
  ExchangeStatusInfo,
  Language,
  MarketContext,
  REJECTION_CATALOG,
  SmcAnalysisResult,
  STRATEGY_RULES,
  Timeframe,
  TIMEFRAME_PRESETS,
} from "@/lib/types";
import type { SavedChartPlan } from "@/lib/chart-data";
import SignalCard, { SignalItem } from "./SignalCard";
import TradeCard, { TradeItem } from "./TradeCard";
import StrategyPanel from "./StrategyPanel";
import AnalysisView from "./AnalysisView";
import AnalysisPopup from "./AnalysisPopup";
import TelegramSettingsPanel from "./TelegramSettingsPanel";
import {
  fmtDateTime,
  fmtPct,
  fmtPrice,
  fmtUsdt,
  fmtVol,
  playAlertChime,
} from "./formatters";

type TabId =
  | "radar"
  | "signals"
  | "active_trades"
  | "markets"
  | "market_analysis"
  | "chart"
  | "spreads"
  | "notifications"
  | "my_trades"
  | "stocks"
  | "favorites";

interface ScanJobSummary {
  id: number;
  status: "RUNNING" | "DONE" | "STOPPED" | "FAILED";
  trigger: "MANUAL" | "AUTO";
  timeframes: Timeframe[];
  exchangeFilter: "ALL" | "BINANCE" | "MEXC";
  cursor: number;
  discoveredCount: number;
  binanceDiscovered: number;
  mexcDiscovered: number;
  scannedCount: number;
  qualifiedCount: number;
  failedCount: number;
  excludedCount: number;
  rejectionSummary: Record<string, number>;
  errorMessage: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

interface NotificationItem {
  id: number;
  type: string;
  symbol: string | null;
  exchange: string | null;
  titleAr: string;
  titleEn: string;
  bodyAr: string;
  bodyEn: string;
  metadata: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

interface MarketRow {
  symbol: string;
  baseAsset: string;
  exchange: ExchangeId;
  marketType: "CRYPTO" | "STOCK";
  sector: string;
  fullName: string | null;
  lastPrice: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  quoteVolume: number;
  spreadPct: number;
  isFavorite: boolean;
  hasActiveSignal: boolean;
  activeSignalScore: number | null;
  activeSignalTf: Timeframe | null;
  hasOpenTrade: boolean;
}

interface BootstrapPayload {
  settings: {
    selectedTimeframes: Timeframe[];
    timeframePreset: string;
    entryMode: "A" | "B";
    autoScanEnabled: boolean;
    autoScanIntervalMinutes: number;
    scoreThreshold: number;
    tradeSizeUsdt: number;
    signalExpiryMinutes: number;
    language: Language;
    soundEnabled: boolean;
    browserNotifications: boolean;
  };
  exchanges: Record<ExchangeId, ExchangeStatusInfo>;
  counts: {
    totalDiscovered: number;
    cryptoCount: number;
    stockCount: number;
    excludedCount: number;
    activeSignalsCount: number;
    openTradesCount: number;
    favoritesCount: number;
    unreadNotificationsCount: number;
  };
  btcContext: MarketContext;
  latestScan: ScanJobSummary | null;
  recentScans: ScanJobSummary[];
  signals: SignalItem[];
  trades: TradeItem[];
  portfolio: {
    tradeSizeUsdt: number;
    activeCapitalUsdt: number;
    unrealizedPnlUsdt: number;
    realizedPnlUsdt: number;
    totalPnlUsdt: number;
    totalValueUsdt: number;
    openCount: number;
    closedCount: number;
    winningClosedCount: number;
  };
  favorites: Array<{
    id: number;
    symbol: string;
    exchange: ExchangeId;
    marketType: "CRYPTO" | "STOCK";
  }>;
  notifications: NotificationItem[];
  tickerTape: Array<{
    symbol: string;
    baseAsset: string;
    exchange: ExchangeId;
    price: number;
    change24h: number;
    marketType: "CRYPTO" | "STOCK";
  }>;
  serverTime: string;
}

interface SpreadsPayload {
  sharedPairsCount: number;
  displayedSpreadsCount: number;
  anomaliesIgnored: number;
  spreads: Array<{
    symbol: string;
    baseAsset: string;
    binancePrice: number;
    mexcPrice: number;
    spreadPct: number;
    cheaperExchange: ExchangeId;
    binanceVolume24h: number;
    mexcVolume24h: number;
  }>;
  riskSummary: {
    openTradesCount: number;
    totalExposureUsdt: number;
    totalPotentialLossUsdt: number;
    maxSingleTradeRiskUsdt: number;
    maxRiskSymbol: string | null;
    closestToStop: {
      symbol: string;
      exchange: string;
      distanceToSlPct: number;
      riskAtSlUsdt: number;
      nearStopWarning: boolean;
    } | null;
    tradeProximity: Array<{
      tradeId: number;
      symbol: string;
      exchange: string;
      entryPrice: number;
      livePrice: number;
      stopLoss: number;
      distanceToSlPct: number;
      riskAtSlUsdt: number;
      nearStopWarning: boolean;
    }>;
  };
}

const SECTORS = [
  { id: "ALL", ar: "كل القطاعات", en: "All Sectors" },
  { id: "GAINERS", ar: "الأكثر صعودًا 24س", en: "Top Gainers 24h" },
  { id: "LOSERS", ar: "الأكثر هبوطًا (ارتداد)", en: "Top Losers (Rebound)" },
  { id: "القياديات الكبرى", ar: "القياديات الكبرى", en: "Majors" },
  { id: "شبكات L1", ar: "شبكات L1", en: "L1 Networks" },
  { id: "شبكات L2", ar: "شبكات L2", en: "L2 Networks" },
  { id: "الذكاء الاصطناعي AI", ar: "الذكاء الاصطناعي AI", en: "AI" },
  { id: "DeFi", ar: "DeFi", en: "DeFi" },
  { id: "عملات الميم", ar: "عملات الميم", en: "Memes" },
  { id: "الأسهم المرمّزة", ar: "الأسهم المرمّزة", en: "Tokenized Stocks" },
];

export default function QannasApp() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("radar");
  const [lang, setLang] = useState<Language>("ar");
  const [toast, setToast] = useState<{ type: "ok" | "err" | "warn"; text: string } | null>(null);

  // Market & Signals filter states
  const [marketFilter, setMarketFilter] = useState<"ALL" | "CRYPTO" | "STOCK" | "FAVORITES">("ALL");
  const [exchangeFilter, setExchangeFilter] = useState<"ALL" | "BINANCE" | "MEXC">("ALL");
  const [sectorFilter, setSectorFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyAPlus, setOnlyAPlus] = useState(false);
  const [signalTfFilter, setSignalTfFilter] = useState<Timeframe | "ALL">("ALL");
  const [tradeTfFilter, setTradeTfFilter] = useState<Timeframe | "ALL">("ALL");

  // Markets table state
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [marketsLoading, setMarketsLoading] = useState(false);
  const [marketsTotalFiltered, setMarketsTotalFiltered] = useState(0);

  // Spreads state
  const [spreadsData, setSpreadsData] = useState<SpreadsPayload | null>(null);
  const [spreadsLoading, setSpreadsLoading] = useState(false);

  // Deep Coin Analysis state
  const [selectedSymbol, setSelectedSymbol] = useState<string>("BTCUSDT");
  const [selectedExchange, setSelectedExchange] = useState<ExchangeId>("BINANCE");
  const [selectedAnalysisTf, setSelectedAnalysisTf] = useState<Timeframe>("4h");
  const [analysisResult, setAnalysisResult] = useState<SmcAnalysisResult | null>(null);
  const [analysisCandles, setAnalysisCandles] = useState<Candle[]>([]);
  const [chartPlan, setChartPlan] = useState<SavedChartPlan | null>(null);
  const analyzeRequest = useRef<AbortController | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Scan button states & elapsed timer
  const [scanActionBusy, setScanActionBusy] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const lastSeenNotifIdRef = useRef<number>(0);

  const showToast = useCallback((type: "ok" | "err" | "warn", text: string) => {
    setToast({ type, text });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  // Sync HTML dir/lang attribute cleanly
  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang]);

  // Fetch Bootstrap state from server
  const fetchBootstrap = useCallback(async (isInitial = false) => {
    try {
      const res = await fetch("/api/bootstrap", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load platform state");
      const payload = json as BootstrapPayload;
      setData(payload);
      setBootError(null);
      if (isInitial && payload.settings?.language) {
        setLang(payload.settings.language);
      }

      // Check for newly arrived FAVORITE_SIGNAL notifications -> chime + browser alert
      const topNotif = payload.notifications?.[0];
      if (topNotif) {
        if (lastSeenNotifIdRef.current > 0 && topNotif.id > lastSeenNotifIdRef.current) {
          if (topNotif.type === "FAVORITE_SIGNAL" || topNotif.type === "TP_HIT" || topNotif.type === "SL_HIT") {
            if (payload.settings?.soundEnabled) playAlertChime();
            if (
              payload.settings?.browserNotifications &&
              typeof Notification !== "undefined" &&
              Notification.permission === "granted"
            ) {
              new Notification(
                payload.settings.language === "ar" ? topNotif.titleAr : topNotif.titleEn,
                {
                  body:
                    payload.settings.language === "ar" ? topNotif.bodyAr : topNotif.bodyEn,
                }
              );
            }
          }
        }
        lastSeenNotifIdRef.current = topNotif.id;
      }
    } catch (err) {
      setBootError((err as Error).message);
    } finally {
      if (isInitial) setBootLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBootstrap(true);
  }, [fetchBootstrap]);

  // Poll faster (2.5s) while a scan is RUNNING, else every 12s
  const isScanRunning = data?.latestScan?.status === "RUNNING";
  useEffect(() => {
    const ms = isScanRunning ? 2500 : 12000;
    const id = setInterval(() => {
      void fetchBootstrap(false);
    }, ms);
    return () => clearInterval(id);
  }, [isScanRunning, fetchBootstrap]);

  // Live elapsed seconds timer during active scan
  useEffect(() => {
    if (!isScanRunning || !data?.latestScan?.startedAt) {
      setElapsedSeconds(0);
      return;
    }
    const startTs = new Date(data.latestScan.startedAt).getTime();
    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTs) / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isScanRunning, data?.latestScan?.startedAt]);

  // Fetch markets list when viewing markets / stocks / favorites / market_analysis
  const fetchMarkets = useCallback(async () => {
    setMarketsLoading(true);
    try {
      const mParam =
        tab === "stocks"
          ? "STOCK"
          : tab === "favorites"
            ? "FAVORITES"
            : marketFilter;
      const params = new URLSearchParams({
        market: mParam,
        exchange: exchangeFilter,
        sector: tab === "stocks" ? "ALL" : sectorFilter,
        search: searchQuery,
        limit: "250",
      });
      const res = await fetch(`/api/markets?${params.toString()}`, { cache: "no-store" });
      const json = await res.json();
      if (res.ok) {
        setMarkets(json.items || []);
        setMarketsTotalFiltered(json.totalFiltered || 0);
      }
    } finally {
      setMarketsLoading(false);
    }
  }, [tab, marketFilter, exchangeFilter, sectorFilter, searchQuery]);

  useEffect(() => {
    if (tab === "markets" || tab === "stocks" || tab === "favorites" || tab === "market_analysis") {
      void fetchMarkets();
    }
  }, [tab, fetchMarkets]);

  // Fetch spreads when viewing Spreads & Risk tab
  const fetchSpreads = useCallback(async () => {
    setSpreadsLoading(true);
    try {
      const res = await fetch("/api/spreads", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setSpreadsData(json);
    } finally {
      setSpreadsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "spreads") {
      void fetchSpreads();
    }
  }, [tab, fetchSpreads]);

  // Coin analysis opens as a popup over the current view, so closing it returns to the exact same spot.
  const [analysisPopupOpen, setAnalysisPopupOpen] = useState(false);
  const popupReturnFocus = useRef<HTMLElement | null>(null);
  const tabRef = useRef<TabId>(tab);
  useEffect(() => { tabRef.current = tab; }, [tab]);

  // The popup owns one history entry: the browser or phone Back button closes it instead of leaving the workspace.
  useEffect(() => {
    if (window.history.state?.qannasAnalysis) {
      window.history.replaceState({ ...window.history.state, qannasAnalysis: false }, "");
    }
    const onPopState = (event: PopStateEvent) => setAnalysisPopupOpen(Boolean(event.state?.qannasAnalysis));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openAnalysisPopup = useCallback(() => {
    popupReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      if (!window.history.state?.qannasAnalysis) window.history.pushState({ qannasAnalysis: true }, "");
    } catch {
      // History is optional here; the popup's own controls still close it.
    }
    setAnalysisPopupOpen(true);
  }, []);

  const closeAnalysisPopup = useCallback(() => {
    if (window.history.state?.qannasAnalysis) window.history.back();
    else setAnalysisPopupOpen(false);
  }, []);

  // Analyze a single coin live
  const runAnalyzeCoin = useCallback(
    async (symbol: string, exchange: ExchangeId, tf: Timeframe, asPopup = true) => {
      analyzeRequest.current?.abort();
      const request = new AbortController();
      analyzeRequest.current = request;
      setAnalysisResult((previous) => previous?.symbol === symbol && previous.exchange === exchange ? previous : null);
      setSelectedSymbol(symbol);
      setSelectedExchange(exchange);
      setSelectedAnalysisTf(tf);
      // On the chart tab itself the analysis simply updates in place.
      if (asPopup && tabRef.current !== "chart") openAnalysisPopup();
      setAnalysisLoading(true);
      setAnalysisError(null);
      try {
        const res = await fetch(
          `/api/analyze?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}&timeframe=${tf}`,
          { cache: "no-store", signal: request.signal }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Analysis failed");
        if (request.signal.aborted) return;
        setAnalysisResult(json.analysis);
        setChartPlan(json.chartPlan ?? null);
        setAnalysisCandles(json.candles || []);
      } catch (err) {
        if (!request.signal.aborted) setAnalysisError((err as Error).message);
      } finally {
        if (!request.signal.aborted) setAnalysisLoading(false);
      }
    },
    [openAnalysisPopup]
  );

  // Load default BTCUSDT analysis when user opens Chart tab directly for first time
  useEffect(() => {
    if (tab === "chart" && !analysisResult && !analysisLoading && !analysisError) {
      void runAnalyzeCoin(selectedSymbol, selectedExchange, selectedAnalysisTf, false);
    }
  }, [tab, analysisResult, analysisLoading, analysisError, runAnalyzeCoin, selectedSymbol, selectedExchange, selectedAnalysisTf]);

  // Settings updater
  async function updateServerSettings(patch: Record<string, unknown>) {
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Settings error");
      setData((prev) => (prev ? { ...prev, settings: json.settings } : prev));
    } catch (err) {
      showToast("err", (err as Error).message);
    }
  }

  async function handleStartScan() {
    setScanActionBusy(true);
    try {
      const res = await fetch("/api/scan/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          timeframes: data?.settings.selectedTimeframes ?? ALL_TIMEFRAMES,
          exchangeFilter,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to start scan");
      showToast(
        "ok",
        lang === "ar"
          ? `بدأ الفحص الشامل على الخادم (${json.job.discoveredCount} زوج Spot — المستبعد 0)`
          : `Server scan started (${json.job.discoveredCount} Spot pairs — 0 excluded)`
      );
      await fetchBootstrap(false);
    } catch (err) {
      showToast("err", (err as Error).message);
    } finally {
      setScanActionBusy(false);
    }
  }

  async function handleStopScan() {
    setScanActionBusy(true);
    try {
      const res = await fetch("/api/scan/stop", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to stop scan");
      showToast(
        "warn",
        lang === "ar"
          ? "تم إيقاف الفحص فعليًا من الخادم — كل الإشارات المكتشفة محفوظة"
          : "Scan stopped on server — all discovered signals remain saved"
      );
      await fetchBootstrap(false);
    } catch (err) {
      showToast("err", (err as Error).message);
    } finally {
      setScanActionBusy(false);
    }
  }

  async function handleToggleFavorite(
    symbol: string,
    exchange: ExchangeId,
    marketType: "CRYPTO" | "STOCK"
  ) {
    try {
      const res = await fetch("/api/favorites/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, exchange, marketType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast(
        "ok",
        json.isFavorite
          ? lang === "ar"
            ? `تمت إضافة ${symbol} للمفضلة (سيصلك تنبيه فوري عند أي فرصة)`
            : `Added ${symbol} to favorites (instant setup alerts enabled)`
          : lang === "ar"
            ? `تمت إزالة ${symbol} من المفضلة`
            : `Removed ${symbol} from favorites`
      );
      await fetchBootstrap(false);
      if (tab === "markets" || tab === "stocks" || tab === "favorites") {
        void fetchMarkets();
      }
    } catch (err) {
      showToast("err", (err as Error).message);
    }
  }

  async function handleActivateSignal(sig: SignalItem) {
    try {
      const res = await fetch("/api/trades/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signalId: sig.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Activation failed");
      showToast(
        "ok",
        lang === "ar"
          ? `تم تفعيل تتبّع صفقة ${sig.symbol} بقيمة 100 USDT وسعر دخول مجمّد`
          : `Tracking activated for ${sig.symbol} (100 USDT, frozen entry)`
      );
      await fetchBootstrap(false);
    } catch (err) {
      showToast("err", (err as Error).message);
    }
  }

  async function handleActivateFromAnalysis(an: SmcAnalysisResult) {
    if (!an.tradePlan) return;
    try {
      const res = await fetch("/api/trades/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: an.symbol,
          baseAsset: an.baseAsset,
          exchange: an.exchange,
          marketType: an.marketType,
          sector: an.sector,
          primaryTimeframe: an.timeframe,
          qualifiedTimeframes: an.qualifiedTimeframes?.length
            ? an.qualifiedTimeframes
            : [an.timeframe],
          score: an.score,
          entryPrice: an.tradePlan.entryPrice,
          stopLoss: an.tradePlan.stopLoss,
          tp1: an.tradePlan.tp1,
          tp2: an.tradePlan.tp2,
          tp3: an.tradePlan.tp3,
          reasons: an.signalReasons,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Activation failed");
      showToast(
        "ok",
        lang === "ar"
          ? `تم تفعيل تتبّع صفقة ${an.symbol} بقيمة 100 USDT وسعر دخول مجمّد`
          : `Tracking activated for ${an.symbol} (100 USDT, frozen entry)`
      );
      await fetchBootstrap(false);
    } catch (err) {
      showToast("err", (err as Error).message);
    }
  }

  async function handleCloseTrade(tradeId: number) {
    try {
      const res = await fetch(`/api/trades/${tradeId}/close`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to close trade");
      showToast(
        "ok",
        lang === "ar" ? "تم إغلاق الصفقة وحفظ النتيجة النهائية" : "Trade closed and realized PnL saved"
      );
      await fetchBootstrap(false);
    } catch (err) {
      showToast("err", (err as Error).message);
    }
  }

  async function handleUpdateSignalLevels(
    signalId: number,
    levels: { stopLoss: number; tp1: number; tp2: number; tp3: number }
  ) {
    const res = await fetch(`/api/signals/${signalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(levels),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Update failed");
    showToast("ok", lang === "ar" ? "تم تحديث مستويات الإشارة" : "Signal levels updated");
    await fetchBootstrap(false);
  }

  async function handleUpdateTradeLevels(
    tradeId: number,
    levels: { stopLoss: number; tp1: number; tp2: number; tp3: number }
  ) {
    const res = await fetch(`/api/trades/${tradeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(levels),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Update failed");
    showToast("ok", lang === "ar" ? "تم تحديث الوقف والأهداف (الدخول مجمّد)" : "Trade SL/TP updated (entry frozen)");
    await fetchBootstrap(false);
  }

  async function handleMarkNotificationsRead(id?: number) {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    });
    await fetchBootstrap(false);
  }

  function handleSelectPreset(presetKey: keyof typeof TIMEFRAME_PRESETS) {
    const preset = TIMEFRAME_PRESETS[presetKey];
    void updateServerSettings({
      timeframePreset: presetKey,
      selectedTimeframes: preset.timeframes,
    });
  }

  function handleToggleSingleTimeframe(tf: Timeframe) {
    const curr = data?.settings.selectedTimeframes ?? ALL_TIMEFRAMES;
    const exists = curr.includes(tf);
    const next = exists ? curr.filter((x) => x !== tf) : [...curr, tf];
    if (next.length === 0) return;
    void updateServerSettings({
      timeframePreset: next.length === 6 ? "all" : "custom",
      selectedTimeframes: next,
    });
  }

  const favSet = useMemo(() => {
    const s = new Set<string>();
    for (const f of data?.favorites ?? []) s.add(`${f.exchange}:${f.symbol}`);
    return s;
  }, [data?.favorites]);

  const openTradeSet = useMemo(() => {
    const s = new Set<string>();
    for (const t of data?.trades ?? []) {
      if (t.status === "OPEN") s.add(`${t.exchange}:${t.symbol}`);
    }
    return s;
  }, [data?.trades]);

  // Base filtered signals (before "حسب الفريم" TF filter so TF chips match exact displayed list!)
  const baseFilteredSignals = useMemo(() => {
    const list = data?.signals ?? [];
    const q = searchQuery.trim().toUpperCase();
    return list
      .filter((s) => {
        // Strict minimum 2% target profit rule
        if (s.tp1Percent < STRATEGY_RULES.MIN_PROFIT_PCT) return false;
        if (marketFilter === "CRYPTO" && s.marketType !== "CRYPTO") return false;
        if (marketFilter === "STOCK" && s.marketType !== "STOCK") return false;
        if (marketFilter === "FAVORITES" && !favSet.has(`${s.exchange}:${s.symbol}`)) return false;
        if (exchangeFilter !== "ALL" && s.exchange !== exchangeFilter) return false;
        if (
          sectorFilter !== "ALL" &&
          sectorFilter !== "GAINERS" &&
          sectorFilter !== "LOSERS" &&
          s.sector !== sectorFilter
        ) {
          return false;
        }
        if (onlyAPlus && s.grade !== "A+") return false;
        if (q && !s.symbol.includes(q) && !s.baseAsset.includes(q)) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score);
  }, [data?.signals, marketFilter, exchangeFilter, sectorFilter, onlyAPlus, searchQuery, favSet]);

  // Exact "حسب الفريم" counters computed directly from baseFilteredSignals!
  const tfCounts = useMemo(() => {
    const counts: Record<Timeframe, number> = {
      "1m": 0,
      "5m": 0,
      "15m": 0,
      "1h": 0,
      "4h": 0,
      "1d": 0,
    };
    for (const sig of baseFilteredSignals) {
      if (counts[sig.primaryTimeframe] !== undefined) {
        counts[sig.primaryTimeframe]++;
      }
    }
    return counts;
  }, [baseFilteredSignals]);

  const displayedSignals = useMemo(() => {
    if (signalTfFilter === "ALL") return baseFilteredSignals;
    return baseFilteredSignals.filter((s) => s.primaryTimeframe === signalTfFilter);
  }, [baseFilteredSignals, signalTfFilter]);

  const openTrades = useMemo(
    () => (data?.trades ?? []).filter((t) => t.status === "OPEN"),
    [data?.trades]
  );
  const openTradeTfCounts = useMemo(() => {
    const counts: Record<Timeframe, number> = {
      "1m": 0,
      "5m": 0,
      "15m": 0,
      "1h": 0,
      "4h": 0,
      "1d": 0,
    };
    for (const tr of openTrades) {
      if (counts[tr.primaryTimeframe] !== undefined) {
        counts[tr.primaryTimeframe]++;
      }
    }
    return counts;
  }, [openTrades]);

  const displayedOpenTrades = useMemo(() => {
    if (tradeTfFilter === "ALL") return openTrades;
    return openTrades.filter((t) => t.primaryTimeframe === tradeTfFilter);
  }, [openTrades, tradeTfFilter]);

  const closedTrades = useMemo(
    () => (data?.trades ?? []).filter((t) => t.status !== "OPEN"),
    [data?.trades]
  );
  const displayedClosedTrades = useMemo(() => {
    if (tradeTfFilter === "ALL") return closedTrades;
    return closedTrades.filter((t) => t.primaryTimeframe === tradeTfFilter);
  }, [closedTrades, tradeTfFilter]);

  const topSignal = data?.signals?.[0] ?? null;
  const latestScan = data?.latestScan ?? null;
  const scanProgressPct =
    latestScan && latestScan.discoveredCount > 0
      ? Math.min(100, Math.round((latestScan.scannedCount / latestScan.discoveredCount) * 100))
      : 0;
  const isPartialScan =
    latestScan &&
    latestScan.status !== "RUNNING" &&
    latestScan.scannedCount < latestScan.discoveredCount;

  const topRejectionEntries = useMemo(() => {
    const sum = latestScan?.rejectionSummary || {};
    return Object.entries(sum)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [latestScan]);

  if (bootLoading) {
    return (
      <div className="min-h-screen bg-[#070B14] flex flex-col items-center justify-center gap-4 p-6">
        <div className="w-12 h-12 rounded-xl bg-[#D4AF37]/15 border border-[#D4AF37]/40 flex items-center justify-center">
          <Crosshair className="w-6 h-6 text-[#D4AF37] animate-pulse" />
        </div>
        <div className="text-center space-y-1">
          <div className="text-lg font-extrabold tracking-wide text-[#D4AF37]">
            QANNAS PRO — قنّاص الأسواق
          </div>
          <div className="text-xs text-[#94A3B8]">
            جاري الاتصال الحي ببورصتي Binance وMEXC واكتشاف جميع أزواج الـ Spot...
          </div>
        </div>
      </div>
    );
  }

  if (bootError && !data) {
    return (
      <div className="min-h-screen bg-[#070B14] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-[#EF4444]/40 bg-[#0D1322] p-6 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-[#EF4444] mx-auto" />
          <div className="text-base font-bold text-[#F8FAFC]">تعذّر تحميل حالة الخادم</div>
          <div className="text-xs text-[#94A3B8] font-num">{bootError}</div>
          <button
            type="button"
            onClick={() => fetchBootstrap(true)}
            className="px-4 py-2 rounded-lg bg-[#D4AF37] text-[#070B14] text-xs font-bold cursor-pointer"
          >
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: TabId; labelAr: string; labelEn: string; count?: number; icon: React.ReactNode }> = [
    { id: "radar", labelAr: "رادار الصفقات", labelEn: "Trade Radar", icon: <Radar className="w-3.5 h-3.5" /> },
    {
      id: "signals",
      labelAr: "الصفقات المتاحة",
      labelEn: "Available Setups",
      count: data?.counts.activeSignalsCount ?? 0,
      icon: <Crosshair className="w-3.5 h-3.5" />,
    },
    {
      id: "active_trades",
      labelAr: "الصفقات المفعّلة",
      labelEn: "Active Trades",
      count: data?.counts.openTradesCount ?? 0,
      icon: <Activity className="w-3.5 h-3.5" />,
    },
    {
      id: "markets",
      labelAr: "كل العملات",
      labelEn: "All Markets",
      count: data?.counts.totalDiscovered ?? 0,
      icon: <Coins className="w-3.5 h-3.5" />,
    },
    { id: "market_analysis", labelAr: "تحليل السوق", labelEn: "Market Analysis", icon: <Compass className="w-3.5 h-3.5" /> },
    { id: "chart", labelAr: "الشارت والتحليل", labelEn: "Chart & Audit", icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { id: "spreads", labelAr: "الفروق والمخاطر", labelEn: "Spreads & Risk", icon: <ArrowLeftRight className="w-3.5 h-3.5" /> },
    {
      id: "notifications",
      labelAr: "التنبيهات",
      labelEn: "Alerts",
      count: data?.counts.unreadNotificationsCount ?? 0,
      icon: <Bell className="w-3.5 h-3.5" />,
    },
    { id: "my_trades", labelAr: "صفقاتي", labelEn: "My Portfolio", icon: <Briefcase className="w-3.5 h-3.5" /> },
    {
      id: "stocks",
      labelAr: "الأسهم المرمّزة",
      labelEn: "Tokenized Stocks",
      count: data?.counts.stockCount ?? 0,
      icon: <Building2 className="w-3.5 h-3.5" />,
    },
    {
      id: "favorites",
      labelAr: "المفضلة",
      labelEn: "Favorites",
      count: data?.counts.favoritesCount ?? 0,
      icon: <Star className="w-3.5 h-3.5" />,
    },
  ];

  // The same analysis view, unchanged, rendered in its tab or inside the popup.
  const analysisView = (
    <AnalysisView
      analysis={analysisResult}
      candles={analysisCandles}
      chartPlan={chartPlan}
      loading={analysisLoading}
      error={analysisError}
      isFavorite={
        analysisResult
          ? favSet.has(`${analysisResult.exchange}:${analysisResult.symbol}`)
          : false
      }
      hasOpenTrade={
        analysisResult
          ? openTradeSet.has(`${analysisResult.exchange}:${analysisResult.symbol}`)
          : false
      }
      lang={lang}
      onSelectTimeframe={(tf) =>
        runAnalyzeCoin(selectedSymbol, selectedExchange, tf, false)
      }
      onRefresh={() =>
        runAnalyzeCoin(selectedSymbol, selectedExchange, selectedAnalysisTf, false)
      }
      onToggleFavorite={handleToggleFavorite}
      onActivateFromAnalysis={handleActivateFromAnalysis}
    />
  );

  return (
    <div className="min-h-screen bg-[#070B14] text-[#E2E8F0] flex flex-col">
      {/* TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-4 left-4 right-4 sm:right-auto sm:max-w-md z-50">
          <div
            className={`rounded-xl px-4 py-3 text-xs font-bold shadow-2xl border flex items-center gap-2 ${
              toast.type === "ok"
                ? "bg-[#0D1322] border-[#10B981]/60 text-[#10B981]"
                : toast.type === "warn"
                  ? "bg-[#0D1322] border-[#D99B26]/60 text-[#D99B26]"
                  : "bg-[#0D1322] border-[#EF4444]/60 text-[#EF4444]"
            }`}
          >
            <span>{toast.text}</span>
          </div>
        </div>
      )}

      {/* STICKY LUXURY HEADER */}
      <header inert={analysisPopupOpen} className="sticky top-0 z-40 border-b border-[#1A2338] bg-[#070B14]/95 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          {/* Logo + Live Badge */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setTab("radar")}
              className="flex items-center gap-2.5 cursor-pointer"
            >
              <div className="w-9 h-9 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/45 flex items-center justify-center">
                <Crosshair className="w-5 h-5 text-[#D4AF37]" />
              </div>
              <div className="text-right">
                <div className="text-sm sm:text-base font-extrabold tracking-wide text-[#D4AF37] leading-none">
                  QANNAS PRO
                </div>
                <div className="text-[10px] text-[#94A3B8] mt-0.5">
                  {lang === "ar" ? "قنّاص الأسواق · اصطياد القاع" : "Market Sniper · Bottom Hunt"}
                </div>
              </div>
            </button>

            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#10B981]/10 border border-[#10B981]/30 text-[10px] font-bold text-[#10B981]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse" />
              <span>{lang === "ar" ? "حي" : "LIVE"}</span>
            </span>
          </div>

          {/* Exchange Status Pills + Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Binance & MEXC live status */}
            {(["BINANCE", "MEXC"] as ExchangeId[]).map((ex) => {
              const st = data?.exchanges?.[ex];
              const ok = st?.connected;
              return (
                <div
                  key={ex}
                  title={
                    ok
                      ? `${st.hostUsed} (${st.latencyMs}ms)`
                      : st?.error || "Disconnected"
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-num ${
                    ok
                      ? "bg-[#0D1322] border-[#1A2338] text-[#CBD5E1]"
                      : "bg-[#EF4444]/10 border-[#EF4444]/40 text-[#EF4444]"
                  }`}
                >
                  {ok ? (
                    <Wifi className="w-3 h-3 text-[#10B981]" />
                  ) : (
                    <WifiOff className="w-3 h-3 text-[#EF4444]" />
                  )}
                  <span className="font-bold">{ex}</span>
                  <span className="text-[#94A3B8]">{ok ? st.pairCount : "ERR"}</span>
                </div>
              );
            })}

            {/* Separate Auto-Scan Toggle */}
            <button
              type="button"
              onClick={() =>
                updateServerSettings({
                  autoScanEnabled: !data?.settings.autoScanEnabled,
                })
              }
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors cursor-pointer ${
                data?.settings.autoScanEnabled
                  ? "bg-[#10B981]/10 border-[#10B981]/35 text-[#10B981]"
                  : "bg-[#0D1322] border-[#1E293B] text-[#64748B]"
              }`}
              title={
                lang === "ar"
                  ? "فحص تلقائي على الخادم كل 5 دقائق حتى والصفحة مغلقة"
                  : "Server-side auto-scan every 5 minutes even when tab is closed"
              }
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${data?.settings.autoScanEnabled ? "text-[#10B981]" : ""}`}
              />
              <span className="hidden sm:inline">
                {lang === "ar" ? "تلقائي 5د" : "Auto 5m"}
              </span>
              <span className="font-num text-[10px]">
                {data?.settings.autoScanEnabled ? "ON" : "OFF"}
              </span>
            </button>

            {/* Instant Scan Button -> Transforms to RED Stop Scan Button while RUNNING! */}
            {isScanRunning ? (
              <button
                type="button"
                disabled={scanActionBusy}
                onClick={handleStopScan}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EF4444] hover:bg-[#DC2626] text-white text-xs font-extrabold cursor-pointer shadow"
              >
                <Square className="w-3.5 h-3.5 fill-white" />
                <span>{lang === "ar" ? "⏹ إيقاف الفحص" : "⏹ Stop Scan"}</span>
                <span className="font-num text-[11px] bg-black/25 px-1.5 py-0.2 rounded">
                  {elapsedSeconds}s
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={scanActionBusy}
                onClick={handleStartScan}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#E5C158] text-[#070B14] text-xs font-extrabold cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-[#070B14]" />
                <span>{lang === "ar" ? "فحص فوري" : "Scan Now"}</span>
              </button>
            )}

            {/* Notifications Bell */}
            <button
              type="button"
              onClick={() => setTab("notifications")}
              className="relative p-2 rounded-lg bg-[#0D1322] hover:bg-[#121A2D] border border-[#1A2338] text-[#CBD5E1] cursor-pointer"
              title={lang === "ar" ? "التنبيهات" : "Notifications"}
            >
              <Bell className="w-4 h-4" />
              {(data?.counts.unreadNotificationsCount ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D4AF37] text-[#070B14] text-[10px] font-extrabold font-num flex items-center justify-center">
                  {data?.counts.unreadNotificationsCount}
                </span>
              )}
            </button>

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={() =>
                updateServerSettings({
                  soundEnabled: !data?.settings.soundEnabled,
                })
              }
              className="p-2 rounded-lg bg-[#0D1322] hover:bg-[#121A2D] border border-[#1A2338] text-[#94A3B8] hover:text-[#D4AF37] cursor-pointer"
              title={lang === "ar" ? "صوت التنبيهات" : "Alert Sound"}
            >
              {data?.settings.soundEnabled ? (
                <Volume2 className="w-4 h-4 text-[#D4AF37]" />
              ) : (
                <VolumeX className="w-4 h-4" />
              )}
            </button>

            {/* AR / EN Switcher */}
            <button
              type="button"
              onClick={() => {
                const next: Language = lang === "ar" ? "en" : "ar";
                setLang(next);
                void updateServerSettings({ language: next });
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0D1322] hover:bg-[#121A2D] border border-[#1A2338] text-xs font-bold text-[#CBD5E1] cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5 text-[#D4AF37]" />
              <span>{lang === "ar" ? "EN" : "عربي"}</span>
            </button>
          </div>
        </div>

        {/* LIVE TICKER TAPE */}
        {data?.tickerTape && data.tickerTape.length > 0 && (
          <div className="border-t border-[#1A2338]/80 bg-[#0A0F1C] overflow-hidden py-1.5">
            <div className="qannas-ticker-track" dir="ltr">
              {[...data.tickerTape, ...data.tickerTape].map((t, idx) => (
                <button
                  key={`${t.symbol}-${idx}`}
                  type="button"
                  onClick={() => runAnalyzeCoin(t.symbol, t.exchange, "4h", true)}
                  className="inline-flex items-center gap-2 px-4 text-[11px] font-num border-r border-[#1A2338]/70 hover:bg-[#121A2D] transition-colors cursor-pointer"
                >
                  <span className="font-bold text-[#E2E8F0]">{t.baseAsset}</span>
                  {t.marketType === "STOCK" && (
                    <span className="text-[9px] px-1 rounded bg-[#D4AF37]/15 text-[#D4AF37]">
                      STOCK
                    </span>
                  )}
                  <span className="text-[#CBD5E1]">{fmtPrice(t.price)}</span>
                  <span
                    className={
                      t.change24h >= 0 ? "text-[#10B981] font-semibold" : "text-[#EF4444] font-semibold"
                    }
                  >
                    {fmtPct(t.change24h)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MAIN 11-TAB NAVIGATION */}
        <nav className="border-t border-[#1A2338] bg-[#070B14]">
          <div className="max-w-[1440px] mx-auto px-3 sm:px-5 flex items-center gap-1 overflow-x-auto py-1.5">
            {navItems.map((item) => {
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    active
                      ? "bg-[#D4AF37] text-[#070B14]"
                      : "text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[#0D1322]"
                  }`}
                >
                  {item.icon}
                  <span>{lang === "ar" ? item.labelAr : item.labelEn}</span>
                  {item.count !== undefined && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[10px] font-num ${
                        active
                          ? "bg-[#070B14]/20 text-[#070B14]"
                          : "bg-[#121A2D] text-[#CBD5E1]"
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </header>

      {/* MAIN CONTENT AREA */}
      <main inert={analysisPopupOpen} className="flex-1 max-w-[1440px] w-full mx-auto px-3 sm:px-5 py-4 space-y-4">
        {/* FIXED NON-NEGOTIABLE RULES BANNER */}
        <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/[0.06] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-[#E5C158]">
            <Shield className="w-4 h-4 text-[#D4AF37] shrink-0" />
            <span>
              {lang === "ar"
                ? "سبوت فقط · 100 USDT للصفقة · ربح ≥ 2% فقط · جميع عملات وأسهم Spot في Binance وMEXC · تنبيهات فرص المفضلة · بدون مفاتيح API"
                : "Spot Only · Fixed 100 USDT/Trade · Min Profit ≥ 2% · All Binance & MEXC Spot Crypto & Tokenized Stocks · Favorite Alerts · No API Keys"}
            </span>
          </div>
          <div className="text-[11px] font-num text-[#94A3B8]">
            {lang === "ar" ? "المستبعد دائمًا:" : "Excluded:"}{" "}
            <strong className="text-[#10B981]">0</strong>
          </div>
        </div>

        {/* EXCHANGE DISCONNECTED HONEST ERROR BANNER */}
        {data && (!data.exchanges.BINANCE.connected || !data.exchanges.MEXC.connected) && (
          <div className="rounded-xl border border-[#EF4444]/40 bg-[#EF4444]/10 p-3 text-xs text-[#FCA5A5] space-y-1">
            <div className="font-bold text-[#EF4444] flex items-center gap-1.5">
              <WifiOff className="w-4 h-4" />
              <span>
                {lang === "ar"
                  ? "تنبيه اتصال مباشر بأحد مصادر البيانات:"
                  : "Live Exchange Connectivity Warning:"}
              </span>
            </div>
            {!data.exchanges.BINANCE.connected && (
              <div className="font-num">Binance: {data.exchanges.BINANCE.error}</div>
            )}
            {!data.exchanges.MEXC.connected && (
              <div className="font-num">MEXC: {data.exchanges.MEXC.error}</div>
            )}
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 1: رادار الصفقات (DASHBOARD RADAR) */}
        {/* =============================================================== */}
        {tab === "radar" && data && (
          <div className="space-y-4 qannas-enter">
            {/* HERO SCAN CARD */}
            <div className="rounded-2xl border border-[#D4AF37]/30 bg-gradient-to-b from-[#0F172A] to-[#0D1322] p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/35 text-[11px] font-bold text-[#D4AF37]">
                    <Sparkles className="w-3 h-3" />
                    <span>
                      {lang === "ar"
                        ? "استراتيجية SMC / ICT لاصطياد القاع · Spot شراء فقط"
                        : "SMC / ICT Bottom-Hunting Engine · Spot Long Only"}
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-extrabold text-[#F8FAFC]">
                    {lang === "ar"
                      ? "الفحص الشامل والترتيب بالأقوى"
                      : "Full Market Scan & Ranked by Setup Strength"}
                  </h1>
                  <p className="text-xs text-[#94A3B8]">
                    {lang === "ar"
                      ? `وضع الفريمات الحالي (${data.settings.selectedTimeframes.length}): ${data.settings.selectedTimeframes.join(" · ")} — يتم فحص كل الأزواج المكتشفة حيًا (${data.counts.totalDiscovered} زوجًا) بدون استبعاد أي عملة.`
                      : `Active Timeframe Mode (${data.settings.selectedTimeframes.length}): ${data.settings.selectedTimeframes.join(" · ")} — scanning all ${data.counts.totalDiscovered} live discovered Spot pairs with zero exclusions.`}
                  </p>
                </div>

                {/* Primary Hero Actions */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {isScanRunning ? (
                    <button
                      type="button"
                      disabled={scanActionBusy}
                      onClick={handleStopScan}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#EF4444] hover:bg-[#DC2626] text-white text-sm font-extrabold cursor-pointer shadow-lg"
                    >
                      <Square className="w-4 h-4 fill-white" />
                      <span>{lang === "ar" ? "⏹ إيقاف الفحص" : "⏹ Stop Scan"}</span>
                      <span className="font-num text-xs bg-black/25 px-2 py-0.5 rounded">
                        {elapsedSeconds}s
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={scanActionBusy}
                      onClick={handleStartScan}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#D4AF37] hover:bg-[#E5C158] text-[#070B14] text-sm font-extrabold cursor-pointer shadow-lg"
                    >
                      <Play className="w-4 h-4 fill-[#070B14]" />
                      <span>
                        {lang === "ar"
                          ? "فحص كل العملات دفعة واحدة"
                          : "Scan All Markets at Once"}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      updateServerSettings({
                        autoScanEnabled: !data.settings.autoScanEnabled,
                      })
                    }
                    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold cursor-pointer ${
                      data.settings.autoScanEnabled
                        ? "bg-[#10B981]/10 border-[#10B981]/40 text-[#10B981]"
                        : "bg-[#070B14] border-[#1E293B] text-[#94A3B8]"
                    }`}
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>
                      {lang === "ar"
                        ? `الفحص التلقائي كل 5 دقائق: ${data.settings.autoScanEnabled ? "مفعّل" : "متوقف"}`
                        : `Auto-Scan Every 5m: ${data.settings.autoScanEnabled ? "ON" : "OFF"}`}
                    </span>
                  </button>
                </div>
              </div>

              {/* Timeframe Selector & Presets inside Hero */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1A2338]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-[#94A3B8] ml-1">
                    {lang === "ar" ? "الإعدادات الجاهزة:" : "Presets:"}
                  </span>
                  {(["all", "fast", "balanced", "swing"] as const).map((pk) => {
                    const p = TIMEFRAME_PRESETS[pk];
                    const active = data.settings.timeframePreset === pk;
                    return (
                      <button
                        key={pk}
                        type="button"
                        onClick={() => handleSelectPreset(pk)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                          active
                            ? "bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]"
                            : "bg-[#070B14] border-[#1E293B] text-[#94A3B8] hover:text-white"
                        }`}
                      >
                        {lang === "ar" ? p.labelAr : p.labelEn}
                      </button>
                    );
                  })}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-[#94A3B8]">
                    {lang === "ar"
                      ? `الفريمات المختارة (${data.settings.selectedTimeframes.length}):`
                      : `Selected TFs (${data.settings.selectedTimeframes.length}):`}
                  </span>
                  {ALL_TIMEFRAMES.map((tf) => {
                    const active = data.settings.selectedTimeframes.includes(tf);
                    return (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => handleToggleSingleTimeframe(tf)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-num font-bold border cursor-pointer ${
                          active
                            ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14]"
                            : "bg-[#070B14] border-[#1E293B] text-[#64748B] hover:text-[#CBD5E1]"
                        }`}
                      >
                        {tf}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* LIVE RESUMABLE SCAN PROGRESS BAR */}
              {latestScan && (
                <div className="rounded-xl bg-[#070B14] border border-[#1A2338] p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded font-num font-extrabold text-[11px] ${
                          latestScan.status === "RUNNING"
                            ? "bg-[#D4AF37]/20 text-[#D4AF37] border border-[#D4AF37]/40"
                            : latestScan.status === "DONE"
                              ? "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/35"
                              : latestScan.status === "STOPPED"
                                ? "bg-[#D99B26]/15 text-[#D99B26] border border-[#D99B26]/35"
                                : "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/35"
                        }`}
                      >
                        {latestScan.status}
                      </span>
                      <span className="text-[#94A3B8]">
                        {lang === "ar" ? `مهمة فحص #${latestScan.id}` : `Scan Job #${latestScan.id}`} (
                        {latestScan.trigger})
                      </span>
                      {isPartialScan && (
                        <span className="px-2 py-0.5 rounded bg-[#D99B26]/15 text-[#D99B26] text-[11px] font-bold">
                          {lang === "ar"
                            ? `فحص جزئي (${latestScan.scannedCount} / ${latestScan.discoveredCount})`
                            : `Partial Scan (${latestScan.scannedCount} / ${latestScan.discoveredCount})`}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 font-num text-[11px]">
                      <span className="text-[#94A3B8]">
                        {lang === "ar" ? "المكتشف:" : "Discovered:"}{" "}
                        <strong className="text-[#F8FAFC]">{latestScan.discoveredCount}</strong>
                      </span>
                      <span className="text-[#94A3B8]">
                        {lang === "ar" ? "المفحوص:" : "Scanned:"}{" "}
                        <strong className="text-[#D4AF37]">{latestScan.scannedCount}</strong>
                      </span>
                      <span className="text-[#94A3B8]">
                        {lang === "ar" ? "المؤهل:" : "Qualified:"}{" "}
                        <strong className="text-[#10B981]">{latestScan.qualifiedCount}</strong>
                      </span>
                      <span className="text-[#94A3B8]">
                        {lang === "ar" ? "الفاشل:" : "Failed:"}{" "}
                        <strong className="text-[#EF4444]">{latestScan.failedCount}</strong>
                      </span>
                      <span className="text-[#94A3B8]">
                        {lang === "ar" ? "المستبعد:" : "Excluded:"}{" "}
                        <strong className="text-[#10B981]">0</strong>
                      </span>
                    </div>
                  </div>

                  <div className="h-2 rounded-full bg-[#121A2D] overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        latestScan.status === "RUNNING"
                          ? "bg-[#D4AF37]"
                          : latestScan.status === "DONE"
                            ? "bg-[#10B981]"
                            : latestScan.status === "STOPPED"
                              ? "bg-[#D99B26]"
                              : "bg-[#EF4444]"
                      }`}
                      style={{ width: `${scanProgressPct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* FOUR REAL-DATA STAT CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {/* Stat 1: Qualified Buy Opportunities */}
              <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#94A3B8] font-semibold">
                    {lang === "ar" ? "فرص الشراء المؤهلة الحية" : "Qualified Live Buy Setups"}
                  </span>
                  <Crosshair className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-3xl font-extrabold font-num text-[#10B981]">
                    {data.counts.activeSignalsCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTab("signals")}
                    className="text-xs font-bold text-[#D4AF37] hover:underline cursor-pointer"
                  >
                    {lang === "ar" ? "عرض الكل ←" : "View All →"}
                  </button>
                </div>
                <div className="text-[11px] text-[#64748B] font-num">
                  {lang === "ar"
                    ? `${data.counts.cryptoCount} عملة رقمية · ${data.counts.stockCount} سهم مرمّز`
                    : `${data.counts.cryptoCount} Crypto · ${data.counts.stockCount} Tokenized Stocks`}
                </div>
              </div>

              {/* Stat 2: Top Spotted Opportunity */}
              <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#94A3B8] font-semibold">
                    {lang === "ar" ? "أعلى فرصة شراء مرصودة" : "Highest-Ranked Opportunity"}
                  </span>
                  <TrendingUp className="w-4 h-4 text-[#10B981]" />
                </div>
                {topSignal ? (
                  <>
                    <div className="flex items-baseline justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          runAnalyzeCoin(
                            topSignal.symbol,
                            topSignal.exchange,
                            topSignal.primaryTimeframe
                          )
                        }
                        className="text-lg font-extrabold font-num text-[#F8FAFC] hover:text-[#D4AF37] cursor-pointer"
                      >
                        {topSignal.baseAsset}/USDT
                      </button>
                      <span className="px-2 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] font-num text-xs font-extrabold">
                        {topSignal.score}/100
                      </span>
                    </div>
                    <div className="text-[11px] text-[#94A3B8] font-num">
                      {topSignal.exchange} · {topSignal.primaryTimeframe} ·{" "}
                      {lang === "ar" ? "دخول" : "Entry"} {fmtPrice(topSignal.entryPrice)}
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-[#64748B] py-2">
                    {lang === "ar" ? "لا توجد فرصة مؤهلة حاليًا" : "No qualified setup right now"}
                  </div>
                )}
              </div>

              {/* Stat 3: Scan Results */}
              <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#94A3B8] font-semibold">
                    {lang === "ar" ? "نتائج الفحص الأخير" : "Latest Scan Status"}
                  </span>
                  <Layers className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <div className="flex items-baseline justify-between font-num">
                  <span className="text-2xl font-extrabold text-[#F8FAFC]">
                    {latestScan ? `${latestScan.scannedCount}/${latestScan.discoveredCount}` : `0/${data.counts.totalDiscovered}`}
                  </span>
                  <span className="text-xs font-bold text-[#D4AF37]">
                    {latestScan?.status ?? "IDLE"}
                  </span>
                </div>
                <div className="text-[11px] text-[#94A3B8] font-num">
                  Binance {data.exchanges.BINANCE.pairCount} · MEXC {data.exchanges.MEXC.pairCount} ·{" "}
                  {lang === "ar" ? "فرص:" : "Hits:"} {latestScan?.qualifiedCount ?? 0}
                </div>
              </div>

              {/* Stat 4: Portfolio & Risk Management */}
              <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[#94A3B8] font-semibold">
                    {lang === "ar" ? "محفظتك وإدارة المخاطر" : "Portfolio & Risk"}
                  </span>
                  <Briefcase className="w-4 h-4 text-[#D4AF37]" />
                </div>
                <div className="flex items-baseline justify-between font-num">
                  <span className="text-2xl font-extrabold text-[#F8FAFC]">
                    {fmtUsdt(data.portfolio.totalValueUsdt)}
                  </span>
                  <span
                    className={`text-sm font-extrabold ${
                      data.portfolio.unrealizedPnlUsdt >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                    }`}
                  >
                    {fmtUsdt(data.portfolio.unrealizedPnlUsdt, true)}
                  </span>
                </div>
                <div className="text-[11px] text-[#94A3B8] font-num">
                  {lang === "ar"
                    ? `للصفقة: 100 USDT · نشطة: ${data.portfolio.openCount}`
                    : `Fixed: 100 USDT/trade · Open: ${data.portfolio.openCount}`}
                </div>
              </div>
            </div>

            {/* LIVE MARKET CONTEXT STRIP (BTC + Risk Regime + Killzone — Context Only) */}
            <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[#94A3B8]">BTC (1d):</span>
                  <span className="font-num font-bold text-[#F8FAFC]">
                    {fmtPrice(data.btcContext.btcPrice)}
                  </span>
                  <span
                    className={`font-num font-bold ${
                      data.btcContext.btcChange24h >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                    }`}
                  >
                    {fmtPct(data.btcContext.btcChange24h)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      data.btcContext.btcDailyTrend === "BULLISH"
                        ? "bg-[#10B981]/15 text-[#10B981]"
                        : data.btcContext.btcDailyTrend === "BEARISH"
                          ? "bg-[#EF4444]/15 text-[#EF4444]"
                          : "bg-[#1E293B] text-[#94A3B8]"
                    }`}
                  >
                    {data.btcContext.btcDailyTrend}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[#94A3B8]">
                    {lang === "ar" ? "حالة المخاطرة:" : "Regime:"}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold font-num ${
                      data.btcContext.riskRegime === "RISK_ON"
                        ? "bg-[#10B981]/15 text-[#10B981]"
                        : data.btcContext.riskRegime === "RISK_OFF"
                          ? "bg-[#EF4444]/15 text-[#EF4444]"
                          : "bg-[#1E293B] text-[#CBD5E1]"
                    }`}
                  >
                    {data.btcContext.riskRegime}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[#94A3B8]">
                    {lang === "ar" ? "الجلسة / Killzone:" : "Session / Killzone:"}
                  </span>
                  <span
                    className={`font-semibold ${
                      data.btcContext.killzoneActive ? "text-[#D4AF37]" : "text-[#CBD5E1]"
                    }`}
                  >
                    {lang === "ar"
                      ? data.btcContext.killzoneNameAr
                      : data.btcContext.killzoneNameEn}
                  </span>
                </div>
              </div>

              <span className="text-[10px] text-[#64748B]">
                {lang === "ar"
                  ? "سياق معلوماتي فقط — ليس شرط دخول"
                  : "Informational context only — never an entry condition"}
              </span>
            </div>

            {/* ALWAYS-VISIBLE STRATEGY PANEL (COMPACT ON RADAR) */}
            <StrategyPanel
              lang={lang}
              compact={true}
              selectedTimeframes={data.settings.selectedTimeframes}
              entryMode={data.settings.entryMode ?? "B"}
              onChangeEntryMode={(mode) => void updateServerSettings({ entryMode: mode })}
            />

            {/* TOP AVAILABLE SETUPS ON RADAR OR EXPLICIT EMPTY STATE */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-extrabold text-[#F8FAFC]">
                    {lang === "ar" ? "الصفقات المتاحة" : "Available Setups"} ({baseFilteredSignals.length})
                  </h2>
                  {/* "حسب الفريم" Counter Chips — Computed directly from displayed list! */}
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[11px] text-[#94A3B8] mx-1">
                      {lang === "ar" ? "اختر الفريم:" : "Choose TF:"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSignalTfFilter("ALL")}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold font-num border cursor-pointer ${
                        signalTfFilter === "ALL"
                          ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14]"
                          : "bg-[#0D1322] border-[#1E293B] text-[#CBD5E1]"
                      }`}
                    >
                      {lang === "ar" ? "الكل" : "All"} ({baseFilteredSignals.length})
                    </button>
                    {ALL_TIMEFRAMES.map((tf) => {
                      const cnt = tfCounts[tf];
                      const active = signalTfFilter === tf;
                      return (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => setSignalTfFilter(active ? "ALL" : tf)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-num border cursor-pointer ${
                            active
                              ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14] font-extrabold"
                              : cnt > 0
                                ? "bg-[#0D1322] border-[#1E293B] text-[#E2E8F0] hover:border-[#D4AF37]/50"
                                : "bg-[#070B14] border-[#1A2338] text-[#475569]"
                          }`}
                        >
                          {tf} ({cnt})
                        </button>
                      );
                    })}
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-md bg-[#10B981]/10 border border-[#10B981]/30 text-[11px] font-bold text-[#10B981]">
                  {lang === "ar" ? "ربح ≥ 2% فقط" : "Profit ≥ 2% Only"}
                </span>
              </div>

              {displayedSignals.length === 0 ? (
                <div className="rounded-2xl border border-[#1A2338] bg-[#0D1322] p-8 text-center space-y-3">
                  <AlertTriangle className="w-8 h-8 text-[#D99B26] mx-auto" />
                  <div className="text-base font-extrabold text-[#F8FAFC]">
                    لا توجد صفقات مؤهلة الآن — NO VALID TRADE SETUPS FOUND
                  </div>
                  <p className="text-xs text-[#94A3B8] max-w-xl mx-auto leading-relaxed">
                    {lang === "ar"
                      ? "تلتزم منصة QANNAS PRO بصرامة تسلسل SMC / ICT لاصطياد القاع وحد التأهل 58/100 وبوابات الجودة الصلبة، ولا تعرض أبدًا صفقات ضعيفة أو مختلقة لملء الشاشة."
                      : "QANNAS PRO strictly enforces the SMC/ICT bottom-hunting sequence, 58/100 threshold, and hard quality gates. Weak or fabricated setups are never displayed."}
                  </p>
                  {topRejectionEntries.length > 0 && (
                    <div className="pt-2 space-y-2">
                      <div className="text-[11px] font-bold text-[#D4AF37]">
                        {lang === "ar"
                          ? "أكثر أسباب الرفض تكرارًا في الفحص الحي:"
                          : "Most Frequent Real Rejection Reasons:"}
                      </div>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {topRejectionEntries.map(([code, count]) => (
                          <span
                            key={code}
                            className="px-2.5 py-1 rounded-lg bg-[#070B14] border border-[#1E293B] text-[11px] text-[#CBD5E1]"
                          >
                            <strong className="font-num text-[#EF4444]">{code}</strong>:{" "}
                            {lang === "ar"
                              ? REJECTION_CATALOG[code]?.ar || code
                              : REJECTION_CATALOG[code]?.en || code}{" "}
                            <span className="font-num text-[#D4AF37]">({count})</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {displayedSignals.map((sig) => (
                    <SignalCard
                      key={sig.id}
                      signal={sig}
                      isFavorite={favSet.has(`${sig.exchange}:${sig.symbol}`)}
                      hasOpenTrade={openTradeSet.has(`${sig.exchange}:${sig.symbol}`)}
                      lang={lang}
                      onActivate={handleActivateSignal}
                      onAnalyze={(sym, ex, tf) => runAnalyzeCoin(sym, ex, tf, true)}
                      onToggleFavorite={handleToggleFavorite}
                      onUpdateLevels={handleUpdateSignalLevels}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 2: الصفقات المتاحة (AVAILABLE SIGNALS + FILTERS) */}
        {/* =============================================================== */}
        {tab === "signals" && data && (
          <div className="space-y-4 qannas-enter">
            {/* Market / Exchange / Sector / Search Filters */}
            <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { id: "ALL", ar: `كل السوق (${data.counts.totalDiscovered})`, en: `All (${data.counts.totalDiscovered})` },
                    { id: "CRYPTO", ar: `العملات الرقمية (${data.counts.cryptoCount})`, en: `Crypto (${data.counts.cryptoCount})` },
                    { id: "STOCK", ar: `الأسهم المرمّزة (${data.counts.stockCount})`, en: `Stocks (${data.counts.stockCount})` },
                    { id: "FAVORITES", ar: `المفضلة (${data.counts.favoritesCount})`, en: `Favorites (${data.counts.favoritesCount})` },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMarketFilter(m.id as typeof marketFilter)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                        marketFilter === m.id
                          ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14]"
                          : "bg-[#070B14] border-[#1E293B] text-[#CBD5E1]"
                      }`}
                    >
                      {lang === "ar" ? m.ar : m.en}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(["ALL", "BINANCE", "MEXC"] as const).map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setExchangeFilter(ex)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                        exchangeFilter === ex
                          ? "bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]"
                          : "bg-[#070B14] border-[#1E293B] text-[#94A3B8]"
                      }`}
                    >
                      {ex === "ALL"
                        ? lang === "ar"
                          ? "المنصتين Spot"
                          : "Both Spot"
                        : `${ex} Spot`}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setOnlyAPlus((v) => !v)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                      onlyAPlus
                        ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14]"
                        : "bg-[#070B14] border-[#1E293B] text-[#94A3B8]"
                    }`}
                  >
                    {lang === "ar" ? "A+ فقط" : "A+ Only"}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="w-4 h-4 text-[#64748B] absolute top-2.5 right-3" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      lang === "ar"
                        ? "بحث فوري بأي عملة أو سهم مرمّز (مثل BTC, SOL, TSLAON)..."
                        : "Instant search any coin or tokenized stock (BTC, SOL, TSLAON)..."
                    }
                    className="w-full rounded-lg bg-[#070B14] border border-[#1E293B] pr-9 pl-3 py-2 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#D4AF37]"
                  />
                </div>
              </div>

              {/* "حسب الفريم" Exact Matching Counter Chips */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#1A2338]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-bold text-[#F8FAFC] ml-2">
                    {lang === "ar" ? "اختر فريم الصفقات المتاحة:" : "Filter Available Setups by TF:"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSignalTfFilter("ALL")}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold font-num border cursor-pointer ${
                      signalTfFilter === "ALL"
                        ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14]"
                        : "bg-[#070B14] border-[#1E293B] text-[#CBD5E1] hover:border-[#D4AF37]/50"
                    }`}
                  >
                    {lang === "ar" ? "الكل" : "All"} ({baseFilteredSignals.length})
                  </button>
                  {ALL_TIMEFRAMES.map((tf) => {
                    const cnt = tfCounts[tf];
                    const active = signalTfFilter === tf;
                    return (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => setSignalTfFilter(active ? "ALL" : tf)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-num border cursor-pointer ${
                          active
                            ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14] font-extrabold"
                            : cnt > 0
                              ? "bg-[#070B14] border-[#1E293B] text-[#E2E8F0] hover:border-[#D4AF37]"
                              : "bg-[#070B14]/50 border-[#1A2338] text-[#475569]"
                        }`}
                      >
                        {tf} ({cnt})
                      </button>
                    );
                  })}
                </div>
                <span className="px-2.5 py-1 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 text-[11px] font-bold text-[#10B981]">
                  {lang === "ar" ? "ربح الهدف الأول ≥ 2% فقط" : "Min TP1 Profit ≥ 2% Only"}
                </span>
              </div>
            </div>

            {displayedSignals.length === 0 ? (
              <div className="rounded-2xl border border-[#1A2338] bg-[#0D1322] p-10 text-center space-y-3">
                <AlertTriangle className="w-8 h-8 text-[#D99B26] mx-auto" />
                <div className="text-base font-extrabold text-[#F8FAFC]">
                  لا توجد صفقات مؤهلة الآن — NO VALID TRADE SETUPS FOUND
                </div>
                <p className="text-xs text-[#94A3B8]">
                  {lang === "ar"
                    ? "اضغط «فحص كل العملات دفعة واحدة» أو اختر فريمًا آخر، أو اضغط على أي عملة من «كل العملات» لتحليلها فورًا بالأرقام."
                    : "Run a full scan or click any symbol in All Markets for immediate step-by-step live analysis."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {displayedSignals.map((sig) => (
                  <SignalCard
                    key={sig.id}
                    signal={sig}
                    isFavorite={favSet.has(`${sig.exchange}:${sig.symbol}`)}
                    hasOpenTrade={openTradeSet.has(`${sig.exchange}:${sig.symbol}`)}
                    lang={lang}
                    onActivate={handleActivateSignal}
                    onAnalyze={(sym, ex, tf) => runAnalyzeCoin(sym, ex, tf, true)}
                    onToggleFavorite={handleToggleFavorite}
                    onUpdateLevels={handleUpdateSignalLevels}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 3: الصفقات المفعّلة (ACTIVE TRACKED TRADES) */}
        {/* =============================================================== */}
        {tab === "active_trades" && data && (
          <div className="space-y-4 qannas-enter">
            <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-extrabold text-[#F8FAFC]">
                    {lang === "ar"
                      ? `الصفقات المفعّلة قيد المراقبة الحية (${displayedOpenTrades.length}${tradeTfFilter !== "ALL" ? ` / ${openTrades.length}` : ""})`
                      : `Active Tracked Spot Trades (${displayedOpenTrades.length}${tradeTfFilter !== "ALL" ? ` / ${openTrades.length}` : ""})`}
                  </h2>
                  <p className="text-xs text-[#94A3B8]">
                    {lang === "ar"
                      ? "مراقبة تلقائية على الخادم بالأسعار الحية لضرب الوقف والأهداف · سعر الدخول مجمّد ولا يتغير · 100 USDT ثابتة لكل صفقة."
                      : "Server-side live monitoring for SL/TP hits · Frozen immutable entry price · Fixed 100 USDT per trade."}
                  </p>
                </div>
                <div className="flex items-center gap-4 font-num text-xs">
                  <div>
                    <span className="text-[#64748B] block text-[10px]">
                      {lang === "ar" ? "رأس المال النشط" : "Active Capital"}
                    </span>
                    <strong className="text-[#F8FAFC]">{fmtUsdt(data.portfolio.activeCapitalUsdt)}</strong>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[10px]">
                      {lang === "ar" ? "الربح/الخسارة العائم" : "Floating PnL"}
                    </span>
                    <strong
                      className={
                        data.portfolio.unrealizedPnlUsdt >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                      }
                    >
                      {fmtUsdt(data.portfolio.unrealizedPnlUsdt, true)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Timeframe Selector for Active Trades ("حسب الفريم") */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2.5 border-t border-[#1A2338]">
                <span className="text-xs font-bold text-[#F8FAFC] ml-2">
                  {lang === "ar" ? "اختر فريم الصفقات المفعّلة:" : "Filter Active Trades by TF:"}
                </span>
                <button
                  type="button"
                  onClick={() => setTradeTfFilter("ALL")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold font-num border cursor-pointer ${
                    tradeTfFilter === "ALL"
                      ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14]"
                      : "bg-[#070B14] border-[#1E293B] text-[#CBD5E1] hover:border-[#D4AF37]/50"
                  }`}
                >
                  {lang === "ar" ? "الكل" : "All"} ({openTrades.length})
                </button>
                {ALL_TIMEFRAMES.map((tf) => {
                  const cnt = openTradeTfCounts[tf];
                  const active = tradeTfFilter === tf;
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => setTradeTfFilter(active ? "ALL" : tf)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-num border cursor-pointer ${
                        active
                          ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14] font-extrabold"
                          : cnt > 0
                            ? "bg-[#070B14] border-[#1E293B] text-[#E2E8F0] hover:border-[#D4AF37]"
                            : "bg-[#070B14]/50 border-[#1A2338] text-[#475569]"
                      }`}
                    >
                      {tf} ({cnt})
                    </button>
                  );
                })}
              </div>
            </div>

            {displayedOpenTrades.length === 0 ? (
              <div className="rounded-2xl border border-[#1A2338] bg-[#0D1322] p-10 text-center space-y-2">
                <Activity className="w-7 h-7 text-[#64748B] mx-auto" />
                <div className="text-sm font-bold text-[#E2E8F0]">
                  {tradeTfFilter !== "ALL"
                    ? lang === "ar"
                      ? `لا توجد صفقات مفعّلة على فريم ${tradeTfFilter} حاليًا`
                      : `No active trades on ${tradeTfFilter} timeframe right now`
                    : lang === "ar"
                      ? "لا توجد صفقات مفعّلة حاليًا"
                      : "No active tracked trades right now"}
                </div>
                <p className="text-xs text-[#94A3B8]">
                  {tradeTfFilter !== "ALL" ? (
                    <button
                      type="button"
                      onClick={() => setTradeTfFilter("ALL")}
                      className="text-[#D4AF37] font-bold hover:underline cursor-pointer"
                    >
                      {lang === "ar" ? "عرض كل الفريمات" : "Show all timeframes"}
                    </button>
                  ) : lang === "ar" ? (
                    "فعّل أي صفقة مؤهلة من «الصفقات المتاحة» لبدء المراقبة الحية للأهداف والوقف على الخادم."
                  ) : (
                    "Activate any qualified setup from Available Setups to start live server-side SL/TP monitoring."
                  )}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {displayedOpenTrades.map((tr) => (
                  <TradeCard
                    key={tr.id}
                    trade={tr}
                    lang={lang}
                    onClose={handleCloseTrade}
                    onAnalyze={(sym, ex, tf) => runAnalyzeCoin(sym, ex, tf, true)}
                    onUpdateLevels={handleUpdateTradeLevels}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 4, 10, 11: كل العملات / الأسهم المرمّزة / المفضلة */}
        {/* =============================================================== */}
        {(tab === "markets" || tab === "stocks" || tab === "favorites") && data && (
          <div className="space-y-4 qannas-enter">
            <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-extrabold text-[#F8FAFC]">
                    {tab === "stocks"
                      ? lang === "ar"
                        ? `الأسهم المرمّزة المكتشفة حيًا (${data.counts.stockCount})`
                        : `Live Discovered Tokenized Stocks (${data.counts.stockCount})`
                      : tab === "favorites"
                        ? lang === "ar"
                          ? `قائمة المفضلة (${data.counts.favoritesCount}) — تنبيهات فورية بالسبب والفريم`
                          : `Favorites (${data.counts.favoritesCount}) — Instant Setup Alerts`
                        : lang === "ar"
                          ? `كل أزواج Spot المكتشفة حيًا (${data.counts.totalDiscovered} · المستبعد: 0)`
                          : `All Live Discovered Spot Pairs (${data.counts.totalDiscovered} · Excluded: 0)`}
                  </h2>
                  <p className="text-xs text-[#94A3B8]">
                    {lang === "ar"
                      ? "اضغط على أي عملة أو سهم لتحليله فورًا خطوة بخطوة ببيانات حية من البورصة."
                      : "Click any coin or tokenized stock for immediate step-by-step live analysis."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {(["ALL", "BINANCE", "MEXC"] as const).map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setExchangeFilter(ex)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                        exchangeFilter === ex
                          ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14]"
                          : "bg-[#070B14] border-[#1E293B] text-[#94A3B8]"
                      }`}
                    >
                      {ex === "ALL" ? (lang === "ar" ? "المنصتين" : "Both") : ex}
                    </button>
                  ))}
                </div>
              </div>

              {tab === "markets" && (
                <div className="flex flex-wrap gap-1.5">
                  {SECTORS.map((sec) => (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => setSectorFilter(sec.id)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                        sectorFilter === sec.id
                          ? "bg-[#D4AF37]/20 border-[#D4AF37] text-[#D4AF37]"
                          : "bg-[#070B14] border-[#1E293B] text-[#94A3B8] hover:text-white"
                      }`}
                    >
                      {lang === "ar" ? sec.ar : sec.en}
                    </button>
                  ))}
                </div>
              )}

              <div className="relative">
                <Search className="w-4 h-4 text-[#64748B] absolute top-2.5 right-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    lang === "ar"
                      ? "ابحث بالرمز أو الاسم (مثل BTC, ETH, SOL, TSLAON, NVDAON)..."
                      : "Search by ticker or name (BTC, ETH, SOL, TSLAON, NVDAON)..."
                  }
                  className="w-full rounded-lg bg-[#070B14] border border-[#1E293B] pr-9 pl-3 py-2 text-xs text-[#F8FAFC] placeholder:text-[#64748B] focus:outline-none focus:border-[#D4AF37]"
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr className="border-b border-[#1A2338] bg-[#0A0F1C] text-[#94A3B8] text-[11px]">
                      <th className="py-2.5 px-3">{lang === "ar" ? "العملة / السهم" : "Asset"}</th>
                      <th className="py-2.5 px-3">{lang === "ar" ? "المنصة" : "Exchange"}</th>
                      <th className="py-2.5 px-3">{lang === "ar" ? "القطاع" : "Sector"}</th>
                      <th className="py-2.5 px-3">{lang === "ar" ? "السعر الحي" : "Live Price"}</th>
                      <th className="py-2.5 px-3">{lang === "ar" ? "التغير 24س" : "24h %"}</th>
                      <th className="py-2.5 px-3">{lang === "ar" ? "الحجم 24س" : "24h Vol"}</th>
                      <th className="py-2.5 px-3">{lang === "ar" ? "السبريد" : "Spread"}</th>
                      <th className="py-2.5 px-3">{lang === "ar" ? "الحالة" : "Status"}</th>
                      <th className="py-2.5 px-3">{lang === "ar" ? "إجراء" : "Action"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1A2338]/70">
                    {marketsLoading ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-[#94A3B8]">
                          {lang === "ar" ? "جاري جلب الأسعار الحية..." : "Loading live markets..."}
                        </td>
                      </tr>
                    ) : markets.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-[#94A3B8]">
                          {lang === "ar" ? "لا توجد نتائج مطابقة للبحث" : "No matching symbols"}
                        </td>
                      </tr>
                    ) : (
                      markets.map((m) => (
                        <tr
                          key={`${m.exchange}-${m.symbol}`}
                          className="hover:bg-[#121A2D]/70 transition-colors"
                        >
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => runAnalyzeCoin(m.symbol, m.exchange, "4h", true)}
                              className="text-right cursor-pointer group"
                            >
                              <div className="font-num font-bold text-[#F8FAFC] group-hover:text-[#D4AF37]">
                                {m.baseAsset}
                                <span className="text-[#64748B] font-normal">/USDT</span>
                              </div>
                              {m.fullName && (
                                <div className="text-[10px] text-[#64748B] truncate max-w-[160px]">
                                  {m.fullName}
                                </div>
                              )}
                            </button>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-[#070B14] border border-[#1E293B] text-[10px] font-num font-bold text-[#CBD5E1]">
                              {m.exchange} Spot
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-[11px] text-[#94A3B8]">{m.sector}</td>
                          <td className="py-2.5 px-3 font-num font-bold text-[#F8FAFC]">
                            {fmtPrice(m.lastPrice)}
                          </td>
                          <td
                            className={`py-2.5 px-3 font-num font-bold ${
                              m.priceChangePercent >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                            }`}
                          >
                            {fmtPct(m.priceChangePercent)}
                          </td>
                          <td className="py-2.5 px-3 font-num text-[#CBD5E1]">
                            {fmtVol(m.quoteVolume)}
                          </td>
                          <td className="py-2.5 px-3 font-num text-[#94A3B8]">
                            {m.spreadPct.toFixed(3)}%
                          </td>
                          <td className="py-2.5 px-3">
                            {m.hasOpenTrade ? (
                              <span className="px-2 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] text-[10px] font-bold">
                                {lang === "ar" ? "صفقة مفتوحة" : "OPEN"}
                              </span>
                            ) : m.hasActiveSignal ? (
                              <span className="px-2 py-0.5 rounded bg-[#10B981]/15 text-[#10B981] text-[10px] font-bold font-num">
                                {m.activeSignalScore}/100 ({m.activeSignalTf})
                              </span>
                            ) : (
                              <span className="text-[10px] text-[#64748B]">Spot</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => runAnalyzeCoin(m.symbol, m.exchange, "4h", true)}
                                className="px-2.5 py-1 rounded bg-[#D4AF37]/15 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-[#070B14] text-[11px] font-bold transition-colors cursor-pointer"
                              >
                                {lang === "ar" ? "تحليل" : "Analyze"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleFavorite(m.symbol, m.exchange, m.marketType)
                                }
                                className="p-1 rounded hover:bg-[#1E293B] cursor-pointer"
                                title={lang === "ar" ? "مفضلة" : "Favorite"}
                              >
                                <Star
                                  className={`w-3.5 h-3.5 ${
                                    m.isFavorite
                                      ? "text-[#D99B26] fill-[#D99B26]"
                                      : "text-[#64748B]"
                                  }`}
                                />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {marketsTotalFiltered > markets.length && (
                <div className="px-4 py-2 text-[11px] text-[#64748B] border-t border-[#1A2338]">
                  {lang === "ar"
                    ? `عرض أول ${markets.length} من ${marketsTotalFiltered} زوجًا (مرتبة بالسيولة) — استخدم البحث للوصول الفوري لأي عملة.`
                    : `Showing top ${markets.length} of ${marketsTotalFiltered} pairs by volume — use search for instant access.`}
                </div>
              )}
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 5: تحليل السوق (FULL STRATEGY + REJECTION AUDIT + SCAN LOG) */}
        {/* =============================================================== */}
        {tab === "market_analysis" && data && (
          <div className="space-y-4 qannas-enter">
            <StrategyPanel
              lang={lang}
              compact={false}
              selectedTimeframes={data.settings.selectedTimeframes}
              entryMode={data.settings.entryMode ?? "B"}
              onChangeEntryMode={(mode) => void updateServerSettings({ entryMode: mode })}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Real Rejection Analytics from Server Scan */}
              <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-3">
                <h3 className="text-sm font-extrabold text-[#F8FAFC] border-b border-[#1A2338] pb-2">
                  {lang === "ar"
                    ? "توزيع أسباب الرفض الحقيقية في آخر فحص (المستبعد = 0)"
                    : "Real Rejection Breakdown — Latest Scan (Excluded = 0)"}
                </h3>
                {topRejectionEntries.length === 0 ? (
                  <p className="text-xs text-[#94A3B8]">
                    {lang === "ar"
                      ? "ابدأ فحصًا شاملًا لعرض إحصائيات أسباب الرفض الحقيقية لكل الأزواج."
                      : "Run a scan to inspect real rejection reasons across all pairs."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {topRejectionEntries.map(([code, cnt]) => {
                      const denom = Math.max(latestScan?.scannedCount || 1, 1);
                      const pct = Math.min(100, Math.round((cnt / denom) * 100));
                      return (
                        <div key={code} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-[#CBD5E1]">
                              <strong className="font-num text-[#EF4444]">{code}</strong> —{" "}
                              {lang === "ar"
                                ? REJECTION_CATALOG[code]?.ar || code
                                : REJECTION_CATALOG[code]?.en || code}
                            </span>
                            <span className="font-num font-bold text-[#D4AF37]">
                              {cnt} ({pct}%)
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[#121A2D] overflow-hidden">
                            <div className="h-full bg-[#EF4444]/70" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Scan History Log */}
              <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-3">
                <h3 className="text-sm font-extrabold text-[#F8FAFC] border-b border-[#1A2338] pb-2">
                  {lang === "ar" ? "سجل مهام الفحص على الخادم" : "Server Scan Job History"}
                </h3>
                {data.recentScans.length === 0 ? (
                  <p className="text-xs text-[#94A3B8]">
                    {lang === "ar" ? "لا توجد مهام فحص مسجلة بعد." : "No scan jobs recorded yet."}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.recentScans.map((sj) => (
                      <div
                        key={sj.id}
                        className="rounded-lg bg-[#070B14] border border-[#1A2338] p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-num font-bold text-[#D4AF37]">#{sj.id}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              sj.status === "DONE"
                                ? "bg-[#10B981]/15 text-[#10B981]"
                                : sj.status === "RUNNING"
                                  ? "bg-[#D4AF37]/20 text-[#D4AF37]"
                                  : sj.status === "STOPPED"
                                    ? "bg-[#D99B26]/15 text-[#D99B26]"
                                    : "bg-[#EF4444]/15 text-[#EF4444]"
                            }`}
                          >
                            {sj.status}
                          </span>
                          <span className="text-[11px] text-[#94A3B8]">
                            {sj.trigger} · {fmtDateTime(sj.startedAt, lang)}
                          </span>
                        </div>
                        <div className="font-num text-[11px] text-[#CBD5E1]">
                          {sj.scannedCount}/{sj.discoveredCount} ·{" "}
                          <strong className="text-[#10B981]">{sj.qualifiedCount}</strong>{" "}
                          {lang === "ar" ? "مؤهل" : "qual"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 6: الشارت والتحليل (STEP-BY-STEP COIN AUDIT + TRADINGVIEW CHART) */}
        {/* =============================================================== */}
        {tab === "chart" && !analysisPopupOpen && analysisView}

        {/* =============================================================== */}
        {/* TAB 7: الفروق والمخاطر (SPREADS & REAL PORTFOLIO RISK) */}
        {/* =============================================================== */}
        {tab === "spreads" && (
          <div className="space-y-4 qannas-enter">
            {/* Real Open Trade Risk Summary */}
            <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#1A2338] pb-2.5">
                <h2 className="text-sm font-extrabold text-[#F8FAFC]">
                  {lang === "ar"
                    ? "ملخص المخاطر الحقيقي (محسوب من صفقاتك المفتوحة الفعلية فقط)"
                    : "Real Risk Summary (Calculated Strictly From Open Trades)"}
                </h2>
                <button
                  type="button"
                  onClick={fetchSpreads}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#121A2D] text-xs text-[#D4AF37] cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${spreadsLoading ? "animate-spin" : ""}`} />
                  <span>{lang === "ar" ? "تحديث" : "Refresh"}</span>
                </button>
              </div>

              {spreadsData && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs font-num">
                    <div className="rounded-lg bg-[#070B14] border border-[#1A2338] p-3">
                      <span className="text-[#94A3B8] block text-[11px]">
                        {lang === "ar" ? "التعرض الكلي النشط" : "Total Active Exposure"}
                      </span>
                      <strong className="text-lg text-[#F8FAFC]">
                        {fmtUsdt(spreadsData.riskSummary.totalExposureUsdt)}
                      </strong>
                    </div>
                    <div className="rounded-lg bg-[#070B14] border border-[#1A2338] p-3">
                      <span className="text-[#94A3B8] block text-[11px]">
                        {lang === "ar" ? "إجمالي المخاطرة عند الوقف" : "Total Risk at SL"}
                      </span>
                      <strong className="text-lg text-[#EF4444]">
                        -{fmtUsdt(spreadsData.riskSummary.totalPotentialLossUsdt)}
                      </strong>
                    </div>
                    <div className="rounded-lg bg-[#070B14] border border-[#1A2338] p-3">
                      <span className="text-[#94A3B8] block text-[11px]">
                        {lang === "ar" ? "أكبر مخاطرة لصفقة واحدة" : "Max Single Trade Risk"}
                      </span>
                      <strong className="text-lg text-[#D99B26]">
                        {spreadsData.riskSummary.maxSingleTradeRiskUsdt > 0
                          ? `-${fmtUsdt(spreadsData.riskSummary.maxSingleTradeRiskUsdt)}`
                          : "$0.00"}
                      </strong>
                      {spreadsData.riskSummary.maxRiskSymbol && (
                        <span className="block text-[10px] text-[#64748B]">
                          {spreadsData.riskSummary.maxRiskSymbol}
                        </span>
                      )}
                    </div>
                    <div className="rounded-lg bg-[#070B14] border border-[#1A2338] p-3">
                      <span className="text-[#94A3B8] block text-[11px]">
                        {lang === "ar" ? "أقرب صفقة لوقفها" : "Closest Trade to SL"}
                      </span>
                      {spreadsData.riskSummary.closestToStop ? (
                        <>
                          <strong
                            className={`text-lg ${
                              spreadsData.riskSummary.closestToStop.nearStopWarning
                                ? "text-[#EF4444]"
                                : "text-[#10B981]"
                            }`}
                          >
                            {spreadsData.riskSummary.closestToStop.distanceToSlPct.toFixed(2)}%
                          </strong>
                          <span className="block text-[10px] text-[#94A3B8]">
                            {spreadsData.riskSummary.closestToStop.symbol} (
                            {spreadsData.riskSummary.closestToStop.exchange})
                          </span>
                        </>
                      ) : (
                        <strong className="text-sm text-[#64748B]">
                          {lang === "ar" ? "لا توجد صفقات مفتوحة" : "No open trades"}
                        </strong>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Live Binance vs MEXC Spreads Table */}
            <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] overflow-hidden">
              <div className="p-4 border-b border-[#1A2338] flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-[#F8FAFC]">
                    {lang === "ar"
                      ? "فروق الأسعار الحية بين Binance وMEXC (Spot USDT)"
                      : "Live Binance vs MEXC Price Spreads (Spot USDT)"}
                  </h3>
                  <p className="text-xs text-[#94A3B8]">
                    {spreadsData
                      ? lang === "ar"
                        ? `الأزواج المشتركة الحقيقية: ${spreadsData.sharedPairsCount} · المعروض (أقل من 10%): ${spreadsData.displayedSpreadsCount} · فجوات شاذة متجاهلة (>10%): ${spreadsData.anomaliesIgnored}`
                        : `Shared Pairs: ${spreadsData.sharedPairsCount} · Valid (<10%): ${spreadsData.displayedSpreadsCount} · Anomalies Ignored (>10%): ${spreadsData.anomaliesIgnored}`
                      : ""}
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right border-collapse">
                  <thead>
                    <tr className="border-b border-[#1A2338] bg-[#0A0F1C] text-[#94A3B8] text-[11px]">
                      <th className="py-2.5 px-3">{lang === "ar" ? "الزوج" : "Pair"}</th>
                      <th className="py-2.5 px-3">Binance Spot</th>
                      <th className="py-2.5 px-3">MEXC Spot</th>
                      <th className="py-2.5 px-3">{lang === "ar" ? "الفجوة %" : "Spread %"}</th>
                      <th className="py-2.5 px-3">{lang === "ar" ? "الأرخص" : "Cheaper"}</th>
                      <th className="py-2.5 px-3">{lang === "ar" ? "تحليل" : "Audit"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1A2338]/70 font-num">
                    {spreadsLoading && !spreadsData ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-[#94A3B8]">
                          {lang === "ar" ? "جاري حساب الفروق الحية..." : "Computing live spreads..."}
                        </td>
                      </tr>
                    ) : (
                      (spreadsData?.spreads ?? []).map((sp) => (
                        <tr key={sp.symbol} className="hover:bg-[#121A2D]/60">
                          <td className="py-2.5 px-3 font-bold text-[#F8FAFC]">{sp.symbol}</td>
                          <td className="py-2.5 px-3 text-[#CBD5E1]">{fmtPrice(sp.binancePrice)}</td>
                          <td className="py-2.5 px-3 text-[#CBD5E1]">{fmtPrice(sp.mexcPrice)}</td>
                          <td
                            className={`py-2.5 px-3 font-bold ${
                              sp.spreadPct >= 0.5 ? "text-[#D4AF37]" : "text-[#10B981]"
                            }`}
                          >
                            {sp.spreadPct.toFixed(3)}%
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded bg-[#070B14] border border-[#1E293B] text-[10px]">
                              {sp.cheaperExchange}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => runAnalyzeCoin(sp.symbol, sp.cheaperExchange, "4h", true)}
                              className="px-2 py-0.5 rounded bg-[#D4AF37]/15 text-[#D4AF37] text-[11px] font-bold cursor-pointer"
                            >
                              {lang === "ar" ? "تحليل" : "Analyze"}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 8: التنبيهات (NOTIFICATIONS LOG) */}
        {/* =============================================================== */}
        {tab === "notifications" && data && (
          <div className="space-y-4 qannas-enter">
            <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-extrabold text-[#F8FAFC]">
                  {lang === "ar" ? "سجل التنبيهات الكامل" : "Full Alerts & Notifications Log"}
                </h2>
                <p className="text-xs text-[#94A3B8]">
                  {lang === "ar"
                    ? "إشارات المفضلة (متضمنة السبب والفريم والفريمات المتوافقة) · ضرب الأهداف والوقف · اكتمال أو توقف الفحوصات."
                    : "Favorite setup alerts (with reasons & timeframes) · TP/SL hits · Scan completions & stops."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (typeof Notification !== "undefined") {
                      const perm = await Notification.requestPermission();
                      if (perm === "granted") {
                        await updateServerSettings({ browserNotifications: true });
                        showToast("ok", lang === "ar" ? "تم تفعيل تنبيهات المتصفح" : "Browser notifications enabled");
                      }
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#121A2D] border border-[#1E293B] text-xs text-[#CBD5E1] cursor-pointer"
                >
                  {lang === "ar" ? "تفعيل إشعارات المتصفح" : "Enable Browser Alerts"}
                </button>
                <button
                  type="button"
                  onClick={() => handleMarkNotificationsRead()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#D4AF37] text-[#070B14] text-xs font-bold cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>{lang === "ar" ? "تحديد الكل كمقروء" : "Mark All Read"}</span>
                </button>
              </div>
            </div>

            <TelegramSettingsPanel lang={lang} />

            {data.notifications.length === 0 ? (
              <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-10 text-center text-xs text-[#94A3B8]">
                {lang === "ar" ? "لا توجد تنبيهات مسجلة حتى الآن." : "No notifications recorded yet."}
              </div>
            ) : (
              <div className="space-y-2.5">
                {data.notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-xl border p-4 flex flex-wrap items-start justify-between gap-3 ${
                      n.isRead
                        ? "bg-[#0D1322] border-[#1A2338]"
                        : "bg-[#121A2D] border-[#D4AF37]/45"
                    }`}
                  >
                    <div className="space-y-1 max-w-3xl">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            n.type === "FAVORITE_SIGNAL"
                              ? "bg-[#D99B26]/20 text-[#D99B26]"
                              : n.type === "TP_HIT"
                                ? "bg-[#10B981]/15 text-[#10B981]"
                                : n.type === "SL_HIT" || n.type === "SCAN_FAILED"
                                  ? "bg-[#EF4444]/15 text-[#EF4444]"
                                  : "bg-[#1E293B] text-[#CBD5E1]"
                          }`}
                        >
                          {n.type}
                        </span>
                        <span className="text-sm font-bold text-[#F8FAFC]">
                          {lang === "ar" ? n.titleAr : n.titleEn}
                        </span>
                        {!n.isRead && (
                          <span className="w-2 h-2 rounded-full bg-[#D4AF37]" />
                        )}
                      </div>
                      <p className="text-xs text-[#CBD5E1] leading-relaxed">
                        {lang === "ar" ? n.bodyAr : n.bodyEn}
                      </p>
                      <div className="text-[10px] text-[#64748B]">
                        {fmtDateTime(n.createdAt, lang)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {n.symbol && n.exchange && (
                        <button
                          type="button"
                          onClick={() =>
                            runAnalyzeCoin(
                              n.symbol!,
                              n.exchange as ExchangeId,
                              ((n.metadata?.primaryTimeframe || n.metadata?.timeframe) as Timeframe) || "4h",
                              true
                            )
                          }
                          className="px-2.5 py-1 rounded bg-[#D4AF37]/15 text-[#D4AF37] text-xs font-bold cursor-pointer"
                        >
                          {lang === "ar" ? "فتح التحليل" : "Analyze"}
                        </button>
                      )}
                      {!n.isRead && (
                        <button
                          type="button"
                          onClick={() => handleMarkNotificationsRead(n.id)}
                          className="px-2 py-1 rounded bg-[#070B14] border border-[#1E293B] text-[11px] text-[#94A3B8] cursor-pointer"
                        >
                          {lang === "ar" ? "مقروء" : "Read"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* =============================================================== */}
        {/* TAB 9: صفقاتي (FULL PORTFOLIO, HISTORY & EVENTS) */}
        {/* =============================================================== */}
        {tab === "my_trades" && data && (
          <div className="space-y-4 qannas-enter">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4">
                <div className="text-xs text-[#94A3B8]">
                  {lang === "ar" ? "القيمة الكلية النشطة" : "Active Portfolio Value"}
                </div>
                <div className="text-2xl font-extrabold font-num text-[#F8FAFC] mt-1">
                  {fmtUsdt(data.portfolio.totalValueUsdt)}
                </div>
                <div className="text-[11px] text-[#64748B] font-num">
                  100 USDT / {lang === "ar" ? "صفقة ثابتة" : "fixed trade"}
                </div>
              </div>
              <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4">
                <div className="text-xs text-[#94A3B8]">
                  {lang === "ar" ? "الربح/الخسارة العائم" : "Unrealized PnL"}
                </div>
                <div
                  className={`text-2xl font-extrabold font-num mt-1 ${
                    data.portfolio.unrealizedPnlUsdt >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                  }`}
                >
                  {fmtUsdt(data.portfolio.unrealizedPnlUsdt, true)}
                </div>
              </div>
              <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4">
                <div className="text-xs text-[#94A3B8]">
                  {lang === "ar" ? "الربح/الخسارة المحقق" : "Realized PnL"}
                </div>
                <div
                  className={`text-2xl font-extrabold font-num mt-1 ${
                    data.portfolio.realizedPnlUsdt >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                  }`}
                >
                  {fmtUsdt(data.portfolio.realizedPnlUsdt, true)}
                </div>
              </div>
              <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4">
                <div className="text-xs text-[#94A3B8]">
                  {lang === "ar" ? "إحصاء الصفقات" : "Trade Counts"}
                </div>
                <div className="text-2xl font-extrabold font-num text-[#D4AF37] mt-1">
                  {data.portfolio.openCount}{" "}
                  <span className="text-xs text-[#94A3B8] font-normal">
                    {lang === "ar" ? "مفتوحة" : "open"} / {data.portfolio.closedCount}{" "}
                    {lang === "ar" ? "مغلقة" : "closed"}
                  </span>
                </div>
              </div>
            </div>

            {/* Timeframe Selector inside My Portfolio */}
            <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] px-4 py-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-[#F8FAFC] ml-2">
                {lang === "ar" ? "تصفية صفقاتي حسب الفريم:" : "Filter My Trades by TF:"}
              </span>
              <button
                type="button"
                onClick={() => setTradeTfFilter("ALL")}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold font-num border cursor-pointer ${
                  tradeTfFilter === "ALL"
                    ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14]"
                    : "bg-[#070B14] border-[#1E293B] text-[#CBD5E1]"
                }`}
              >
                {lang === "ar" ? "الكل" : "All"} ({openTrades.length})
              </button>
              {ALL_TIMEFRAMES.map((tf) => {
                const cnt = openTradeTfCounts[tf];
                const active = tradeTfFilter === tf;
                return (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => setTradeTfFilter(active ? "ALL" : tf)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-num border cursor-pointer ${
                      active
                        ? "bg-[#D4AF37] border-[#D4AF37] text-[#070B14] font-extrabold"
                        : cnt > 0
                          ? "bg-[#070B14] border-[#1E293B] text-[#E2E8F0] hover:border-[#D4AF37]"
                          : "bg-[#070B14]/50 border-[#1A2338] text-[#475569]"
                    }`}
                  >
                    {tf} ({cnt})
                  </button>
                );
              })}
            </div>

            {displayedOpenTrades.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-extrabold text-[#D4AF37]">
                  {lang === "ar"
                    ? `الصفقات المفتوحة حاليًا (${displayedOpenTrades.length})`
                    : `Currently Open Trades (${displayedOpenTrades.length})`}
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {displayedOpenTrades.map((tr) => (
                    <TradeCard
                      key={tr.id}
                      trade={tr}
                      lang={lang}
                      onClose={handleCloseTrade}
                      onAnalyze={(sym, ex, tf) => runAnalyzeCoin(sym, ex, tf, true)}
                      onUpdateLevels={handleUpdateTradeLevels}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-sm font-extrabold text-[#F8FAFC]">
                {lang === "ar"
                  ? `سجل الصفقات المغلقة (${displayedClosedTrades.length})`
                  : `Closed Trades History (${displayedClosedTrades.length})`}
              </h3>
              {displayedClosedTrades.length === 0 ? (
                <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-8 text-center text-xs text-[#94A3B8]">
                  {lang === "ar" ? "لا توجد صفقات مغلقة مطابقة." : "No matching closed trades."}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {displayedClosedTrades.map((tr) => (
                    <TradeCard
                      key={tr.id}
                      trade={tr}
                      lang={lang}
                      onClose={handleCloseTrade}
                      onAnalyze={(sym, ex, tf) => runAnalyzeCoin(sym, ex, tf, true)}
                      onUpdateLevels={handleUpdateTradeLevels}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer inert={analysisPopupOpen} className="border-t border-[#1A2338] bg-[#070B14] py-4 px-5 mt-8">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#64748B]">
          <div>
            <strong className="text-[#D4AF37]">QANNAS PRO — قنّاص الأسواق</strong> ·{" "}
            {lang === "ar"
              ? "بيانات حية فقط من Binance & MEXC Spot · لا أوامر حقيقية ولا مفاتيح API · درجة الإشارة تقيس قوة الإعداد وليست احتمال ربح."
              : "Real live data only from Binance & MEXC Spot · No real order execution or API keys · Signal score measures setup strength, NOT win probability."}
          </div>
          <div className="font-num">
            {data ? `Binance (${data.exchanges.BINANCE.pairCount}) + MEXC (${data.exchanges.MEXC.pairCount}) = ${data.counts.totalDiscovered} Spot` : ""}
          </div>
        </div>
      </footer>

      {analysisPopupOpen && (
        <AnalysisPopup
          title={`${selectedSymbol} · ${selectedExchange} Spot`}
          lang={lang}
          onClose={closeAnalysisPopup}
          returnFocusRef={popupReturnFocus}
        >
          {analysisView}
        </AnalysisPopup>
      )}
    </div>
  );
}
