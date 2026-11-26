"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity, BarChart3, CandlestickChart, Crosshair, Maximize, Minimize, Minus,
  RefreshCw, RotateCcw, Ruler, TrendingUp, Undo2, X, ZoomIn, ZoomOut,
} from "lucide-react";
import {
  CandlestickSeries, ColorType, CrosshairMode, HistogramSeries, LineSeries, LineStyle,
  PriceScaleMode, createChart, createTextWatermark,
  type AutoscaleInfoProvider, type IChartApi, type IPriceLine, type ISeriesApi, type MouseEventParams, type Time,
} from "lightweight-charts";
import { MAX_CHART_CANDLES } from "@/lib/chart-data";
import { ALL_TIMEFRAMES, type Candle, type ExchangeId, type Language, type Timeframe, type ZoneBox } from "@/lib/types";
import { candleTime, chartOverlays, type CandleFlag, type ChartDrawing, type ChartPoint } from "./chart-overlays";
import { fmtPct } from "./formatters";
import { useChartCandles } from "./useChartCandles";

export interface ChartLevels {
  entry: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  /** When the saved setup's entry price was fixed; the entry line starts at that candle. */
  startedAt?: string | null;
}

interface TradingViewChartProps {
  symbol: string;
  exchange: ExchangeId;
  analysisTimeframe: Timeframe;
  initialCandles: Candle[];
  levels?: ChartLevels | null;
  zones?: ZoneBox[];
  zoneTimeframe?: Timeframe;
  lang: Language;
}

type DrawingTool = "crosshair" | "trend" | "horizontal" | "measure";
const UP = "#26a69a";
const DOWN = "#ef5350";
const GLOW = "#d4af37";
const GRID = "#2a2e39";
const EMPTY_ZONES: ZoneBox[] = [];
const COUNT_FORMAT = new Intl.NumberFormat("en-US");
const VOLUME_FORMAT = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 });
const TIME_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });
const RANGES = [{ label: "1D", days: 1 }, { label: "5D", days: 5 }, { label: "1M", days: 30 }, { label: "3M", days: 90 }, { label: "1Y", days: 365 }] as const;

interface ChartRuntime {
  chart: IChartApi;
  price: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  ema: ISeriesApi<"Line">;
  watermark: ReturnType<typeof createTextWatermark<Time>>;
  overlay: ReturnType<typeof chartOverlays>;
  bars: Candle[];
  byTime: Map<number, Candle>;
  tf: Timeframe | null;
  lines: IPriceLine[];
}

function bar(c: Candle) {
  return { time: candleTime(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close };
}
function volumeBar(c: Candle) {
  return { time: candleTime(c.openTime), value: c.volume, color: c.close >= c.open ? "rgba(38,166,154,.52)" : "rgba(239,83,80,.48)" };
}
function pricePrecision(p: number) {
  if (p >= 100) return 2;
  if (p >= 10) return 3;
  if (p >= 1) return 4;
  return Math.min(16, Math.max(5, Math.ceil(-Math.log10(p)) + 4));
}
function toRecent(rt: ChartRuntime) {
  if (!rt.bars.length) return;
  const width = rt.chart.timeScale().width();
  const count = Math.min(rt.bars.length, Math.max(28, Math.min(145, Math.round(width / 8))));
  rt.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, rt.bars.length - count), to: rt.bars.length + 4 });
}
/** Index of the last candle that opened at or before `ms`; -1 when that moment is older than the loaded history. */
function indexAtOrBefore(candles: Candle[], ms: number) {
  let low = 0;
  let high = candles.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (candles[middle].openTime <= ms) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
}
function elapsed(seconds: number, ar: boolean) {
  const minutes = Math.round(seconds / 60);
  const days = Math.floor(minutes / 1_440);
  const hours = Math.floor((minutes % 1_440) / 60);
  const rest = minutes % 60;
  const [d, h, m] = ar ? ["ي", "س", "د"] : ["d", "h", "m"];
  const parts = [days ? `${days}${d}` : "", hours ? `${hours}${h}` : "", rest && !days ? `${rest}${m}` : ""].filter(Boolean);
  return parts.join(" ") || `0${m}`;
}
/** Rise or drop between two chart points: percent first, then the price move, candle count and elapsed time. */
function measureLines(start: ChartPoint, end: ChartPoint, candles: Candle[], digits: number, ar: boolean) {
  const move = end.price - start.price;
  const sign = move > 0 ? "+" : move < 0 ? "-" : "";
  const lines = [`${sign}${Math.abs((move / start.price) * 100).toFixed(2)}%  (${sign}${Math.abs(move).toFixed(digits)})`];
  const bars = Math.abs(indexAtOrBefore(candles, end.time * 1_000) - indexAtOrBefore(candles, start.time * 1_000));
  if (bars) lines.push(`${bars} ${ar ? "شمعة" : bars === 1 ? "bar" : "bars"} · ${elapsed(Math.abs(end.time - start.time), ar)}`);
  return lines;
}
function ChartButton({ title, active, onClick, disabled, children }: { title: string; active?: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return <button type="button" className="tv-icon-button" title={title} aria-label={title} aria-pressed={active} onClick={onClick} disabled={disabled}>{children}</button>;
}

export default function TradingViewChart({ symbol, exchange, analysisTimeframe, initialCandles, levels, zones = EMPTY_ZONES, zoneTimeframe = analysisTimeframe, lang }: TradingViewChartProps) {
  const ar = lang === "ar";
  const [tf, setTf] = useState(analysisTimeframe);
  const [showVolume, setVolume] = useState(true);
  const [showEma, setShowEma] = useState(false);
  const [logScale, setLogScale] = useState(false);
  const [tool, setTool] = useState<DrawingTool>("crosshair");
  const [firstPoint, setFirstPoint] = useState<ChartPoint | null>(null);
  const [drawingMap, setDrawingMap] = useState<Partial<Record<Timeframe, ChartDrawing[]>>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState<{ tf: Timeframe; candle: Candle } | null>(null);
  const [selected, setSelected] = useState<{ tf: Timeframe; time: number } | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const runtime = useRef<ChartRuntime | null>(null);
  const toolRef = useRef<DrawingTool>("crosshair");
  const startRef = useRef<ChartPoint | null>(null);
  const { feed, retry } = useChartCandles(symbol, exchange, tf, analysisTimeframe, initialCandles);
  const barCount = feed.candles.length;
  const display = (hover?.tf === tf ? hover.candle : null) ?? feed.candles.at(-1);
  const digits = pricePrecision(feed.candles.at(-1)?.close ?? 100);
  const drawings = drawingMap[tf];
  const { entry, stopLoss, tp1, tp2, tp3, startedAt } = levels ?? {};

  // The candle the trade started from: the last one that had opened when the entry price was fixed.
  const startedMs = startedAt ? Date.parse(startedAt) : NaN;
  const startIndex = Number.isFinite(startedMs) ? indexAtOrBefore(feed.candles, startedMs) : -1;
  const startCandle = startIndex >= 0 ? feed.candles[startIndex] : null;
  const startTime = startCandle?.openTime ?? null;

  const selectedIndex = selected?.tf === tf ? indexAtOrBefore(feed.candles, selected.time) : -1;
  const selectedCandle = selectedIndex >= 0 && feed.candles[selectedIndex].openTime === selected?.time ? feed.candles[selectedIndex] : null;
  const selectedChange = selectedCandle ? ((selectedCandle.close - selectedCandle.open) / selectedCandle.open) * 100 : 0;
  const selectedRange = selectedCandle ? ((selectedCandle.high - selectedCandle.low) / selectedCandle.low) * 100 : 0;

  const lastMeasure = drawings?.findLast((drawing) => drawing.kind === "measure");
  const measureText = lastMeasure && lastMeasure.kind === "measure"
    ? `${ar ? "آخر قياس" : "Last measurement"}: ${lastMeasure.end.price >= lastMeasure.start.price ? (ar ? "ارتفاع" : "rise") : (ar ? "انخفاض" : "drop")} ${measureLines(lastMeasure.start, lastMeasure.end, feed.candles, digits, ar).join(" · ")}`
    : "";

  function chooseTool(next: DrawingTool) {
    toolRef.current = next;
    startRef.current = null;
    runtime.current?.overlay.setPointer(null, null);
    setFirstPoint(null);
    setTool(next);
    if (next !== "crosshair") setSelected(null);
  }

  useEffect(() => {
    const canvas = container.current;
    if (!canvas) return;
    const chart = createChart(canvas, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#131722" }, textColor: "#a5adbc", fontSize: 11, fontFamily: '"Trebuchet MS", system-ui, sans-serif', attributionLogo: true },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: "#758093", style: LineStyle.Dashed, labelBackgroundColor: "#363d4c" }, horzLine: { color: "#758093", style: LineStyle.Dashed, labelBackgroundColor: "#363d4c" } },
      rightPriceScale: { borderColor: GRID, alignLabels: true, minimumWidth: 65, scaleMargins: { top: 0.12, bottom: 0.21 } },
      timeScale: { borderColor: GRID, timeVisible: true, secondsVisible: false, rightOffset: 5, minBarSpacing: 0.025, fixLeftEdge: true, lockVisibleTimeRangeOnResize: true, enableConflation: true },
      grid: { vertLines: { color: "#1e222d" }, horzLines: { color: "#1e222d" } },
      localization: { locale: "en-GB" },
      handleScale: true,
      handleScroll: true,
    });
    const price = chart.addSeries(CandlestickSeries, { upColor: UP, downColor: DOWN, wickUpColor: UP, wickDownColor: DOWN, borderVisible: false, priceLineStyle: LineStyle.Dotted });
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: "volume", priceFormat: { type: "volume" }, lastValueVisible: false, priceLineVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.81, bottom: 0.025 } });
    const ema = chart.addSeries(LineSeries, { color: "#d4af37", lineWidth: 1, visible: false, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    const watermark = createTextWatermark(chart.panes()[0], { horzAlign: "center", vertAlign: "center", lines: [] });
    const overlay = chartOverlays(chart, price, getComputedStyle(canvas).fontFamily);
    const rt: ChartRuntime = { chart, price, volume, ema, watermark, overlay, bars: [], byTime: new Map(), tf: null, lines: [] };
    runtime.current = rt;

    /** Chart point under a pane coordinate. `magnet` (px) snaps the price to that candle's nearest high/low/open/close. */
    function pointAt(x: number, y: number, magnet = 0): { point: ChartPoint; candle: Candle } | null {
      const time = chart.timeScale().coordinateToTime(x);
      const candle = typeof time === "number" ? rt.byTime.get(time) : undefined;
      const raw = price.coordinateToPrice(y);
      if (typeof time !== "number" || !candle || raw === null || raw <= 0) return null;
      let value: number = raw;
      let nearest = magnet;
      for (const level of [candle.high, candle.low, candle.open, candle.close]) {
        const levelY = price.priceToCoordinate(level);
        const distance = levelY === null ? Infinity : Math.abs(levelY - y);
        if (distance < nearest) {
          nearest = distance;
          value = level;
        }
      }
      return { point: { time, price: value }, candle };
    }
    function onCrosshair(param: MouseEventParams) {
      const candle = typeof param.time === "number" ? rt.byTime.get(param.time) : undefined;
      setHover(candle && rt.tf ? { tf: rt.tf, candle } : null);
      const start = startRef.current;
      if (!start) return;
      const measuring = toolRef.current === "measure";
      const hit = param.point ? pointAt(param.point.x, param.point.y, measuring ? 10 : 0) : null;
      overlay.setPointer(start, hit?.point ?? null, measuring ? "measure" : "trend");
    }
    function placeDrawingPoint(point: ChartPoint) {
      const drawMode = toolRef.current;
      const currentTf = rt.tf;
      if (drawMode === "crosshair" || !currentTf) return;
      const start = startRef.current;
      if (drawMode !== "horizontal" && !start) {
        startRef.current = point;
        setFirstPoint(point);
        overlay.setPointer(point, point, drawMode);
        return;
      }
      // A measurement needs two different points; ignore a repeated tap on the first one.
      if (drawMode === "measure" && start && start.time === point.time && start.price === point.price) return;
      const drawing: ChartDrawing = drawMode === "horizontal" || !start ? { kind: "horizontal", price: point.price } : { kind: drawMode, start, end: point };
      setDrawingMap((prev) => ({ ...prev, [currentTf]: [...(prev[currentTf] ?? []).slice(-39), drawing] }));
      chooseTool("crosshair");
    }
    // The native chart groups quick clicks, even when they are at different distances.
    // Read taps directly for drawing and candle selection, leaving scrolling, pinch and dragging to the chart.
    let down: { x: number; y: number; id: number } | null = null;
    const onDown = (event: PointerEvent) => {
      if (event.isPrimary && event.button === 0) down = { x: event.clientX, y: event.clientY, id: event.pointerId };
    };
    const onUp = (event: PointerEvent) => {
      const anchor = down;
      down = null;
      if (!anchor || anchor.id !== event.pointerId || Math.hypot(event.clientX - anchor.x, event.clientY - anchor.y) > 7) return;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || x >= chart.timeScale().width() || y < 0 || y >= chart.panes()[0].getHeight()) return;
      const finger = event.pointerType !== "mouse";
      const mode = toolRef.current;
      const hit = pointAt(x, y, mode === "measure" ? (finger ? 18 : 10) : 0);
      if (mode !== "crosshair") {
        if (hit) placeDrawingPoint(hit.point);
        return;
      }
      // Tapping a candle pins its percentages; tapping it again, or empty chart space, clears them.
      const currentTf = rt.tf;
      const top = hit ? price.priceToCoordinate(hit.candle.high) : null;
      const bottom = hit ? price.priceToCoordinate(hit.candle.low) : null;
      const reach = finger ? 26 : 14;
      if (!hit || !currentTf || top === null || bottom === null || y < top - reach || y > bottom + reach) {
        setSelected(null);
        return;
      }
      const time = hit.candle.openTime;
      setSelected((previous) => (previous?.tf === currentTf && previous.time === time ? null : { tf: currentTf, time }));
    };
    const onCancel = () => { down = null; };
    chart.subscribeCrosshairMove(onCrosshair);
    canvas.addEventListener("pointerdown", onDown, true);
    canvas.addEventListener("pointerup", onUp, true);
    canvas.addEventListener("pointercancel", onCancel, true);
    const onFullscreen = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      chart.unsubscribeCrosshairMove(onCrosshair);
      canvas.removeEventListener("pointerdown", onDown, true);
      canvas.removeEventListener("pointerup", onUp, true);
      canvas.removeEventListener("pointercancel", onCancel, true);
      chart.remove();
      runtime.current = null;
    };
  }, []);

  // Escape first cancels whatever is active inside the chart. Marking the event as handled
  // keeps a surrounding popup open until the chart has nothing left to cancel.
  const busy = tool !== "crosshair" || expanded || selected !== null;
  useEffect(() => {
    if (!busy) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      toolRef.current = "crosshair";
      startRef.current = null;
      runtime.current?.overlay.setPointer(null, null);
      setFirstPoint(null);
      setTool("crosshair");
      setExpanded(false);
      setSelected(null);
    };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [busy]);

  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    const next = feed.candles;
    const old = rt.bars;
    const switched = rt.tf !== tf;
    if (!switched && old === next) return;
    const range = !switched && old.length ? rt.chart.timeScale().getVisibleLogicalRange() : null;
    rt.tf = tf;
    rt.bars = next;
    rt.byTime = new Map(next.map((c) => [candleTime(c.openTime), c]));
    if (switched) {
      rt.chart.timeScale().applyOptions({ timeVisible: tf !== "1d" });
      rt.chart.priceScale("right").setAutoScale(true);
      rt.watermark.applyOptions({ lines: [
        { text: `${symbol.replace(/USDT$/, "")} / USDT · ${tf}`, color: "rgba(154,163,182,.14)", fontSize: 39, fontStyle: "bold" },
        { text: `${exchange} SPOT`, color: "rgba(154,163,182,.11)", fontSize: 16 },
      ] });
    }
    const incremental = !switched && old.length > 0 && next.length >= old.length && old.slice(0, -1).every((c, i) => next[i] === c) && old.at(-1)?.openTime === next[old.length - 1]?.openTime;
    if (incremental) {
      for (let i = old.length - 1; i < next.length; i++) {
        if (old[i] === next[i]) continue;
        rt.price.update(bar(next[i]));
        rt.volume.update(volumeBar(next[i]));
      }
    } else {
      rt.price.setData(next.map(bar));
      rt.volume.setData(next.map(volumeBar));
      if (range && next.length) {
        // Prepending archives must not move the candle the trader was looking at.
        const anchor = next.findIndex((c) => c.openTime === old.at(-1)?.openTime);
        if (anchor >= 0) {
          const followsLatest = range.to >= old.length - 1;
          const shift = followsLatest ? next.length - old.length : anchor - old.length + 1;
          rt.chart.timeScale().setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
        } else toRecent(rt);
      } else if (next.length) toRecent(rt);
    }
  }, [feed.candles, tf, symbol, exchange]);

  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    const format = { type: "price" as const, precision: digits, minMove: 10 ** -digits };
    rt.price.applyOptions({ priceFormat: format });
    rt.ema.applyOptions({ priceFormat: format });
  }, [digits]);

  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    rt.volume.applyOptions({ visible: showVolume });
    rt.chart.priceScale("right").applyOptions({ scaleMargins: { top: 0.12, bottom: showVolume ? 0.21 : 0.08 } });
    rt.ema.applyOptions({ visible: showEma });
    if (!showEma) { rt.ema.setData([]); return; }
    const source = feed.candles;
    if (source.length < 20) { rt.ema.setData([]); return; }
    let ema = source.slice(0, 20).reduce((sum, c) => sum + c.close, 0) / 20;
    rt.ema.setData(source.slice(19).map((c, i) => {
      if (i) ema += (c.close - ema) * (2 / 21);
      return { time: candleTime(c.openTime), value: ema };
    }));
  }, [showVolume, showEma, feed.candles]);

  useEffect(() => {
    const rt = runtime.current;
    if (rt) rt.chart.priceScale("right").applyOptions({ mode: logScale ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal });
  }, [logScale]);

  useEffect(() => {
    const rt = runtime.current;
    if (!rt) return;
    for (const line of rt.lines) rt.price.removePriceLine(line);
    const labels = [
      { title: "ENTRY", price: entry, color: GLOW }, { title: "SL", price: stopLoss, color: DOWN },
      { title: "TP1", price: tp1, color: UP }, { title: "TP2", price: tp2, color: UP }, { title: "TP3", price: tp3, color: UP },
    ];
    // When the trade's first candle is loaded, the overlay draws the entry line from that candle;
    // the price line then only keeps its ENTRY label on the price axis.
    rt.lines = labels.flatMap(({ price, title, color }) => price != null && Number.isFinite(price) && price > 0
      ? [rt.price.createPriceLine({ price, title, color, lineWidth: 1, lineStyle: title === "ENTRY" ? LineStyle.Solid : LineStyle.Dashed, axisLabelVisible: true, lineVisible: title !== "ENTRY" || startTime === null })] : []);
    const marked = labels.flatMap(({ price }) => price != null && Number.isFinite(price) && price > 0 ? [price] : []);
    const drawnZones = tf === zoneTimeframe ? zones : EMPTY_ZONES;
    const extremes = [...marked, ...drawnZones.flatMap((z) => [z.low, z.high]).filter((p) => Number.isFinite(p) && p > 0)];
    rt.overlay.setZones(drawnZones);
    const autoscaleInfoProvider: AutoscaleInfoProvider = (original) => {
      const base = original();
      if (!base?.priceRange || !extremes.length) return base;
      return { ...base, priceRange: { minValue: Math.min(base.priceRange.minValue, ...extremes), maxValue: Math.max(base.priceRange.maxValue, ...extremes) } };
    };
    rt.price.applyOptions({ autoscaleInfoProvider });
  }, [entry, stopLoss, tp1, tp2, tp3, zones, zoneTimeframe, tf, startTime]);

  useEffect(() => {
    const valid = startTime !== null && entry != null && Number.isFinite(entry) && entry > 0;
    runtime.current?.overlay.setEntryStart(valid ? { time: candleTime(startTime), price: entry } : null);
  }, [startTime, entry]);

  useEffect(() => {
    const flags: CandleFlag[] = [];
    if (startCandle) flags.push({ time: candleTime(startCandle.openTime), high: startCandle.high, low: startCandle.low, text: ar ? "بداية الصفقة" : "Trade start", color: GLOW, ink: "#131722", side: "below" });
    if (selectedCandle) {
      flags.push({
        time: candleTime(selectedCandle.openTime), high: selectedCandle.high, low: selectedCandle.low,
        text: fmtPct(((selectedCandle.close - selectedCandle.open) / selectedCandle.open) * 100),
        color: selectedCandle.close >= selectedCandle.open ? UP : DOWN, ink: "#ffffff", side: "above",
      });
    }
    runtime.current?.overlay.setFlags(flags);
  }, [startCandle, selectedCandle, ar]);

  useEffect(() => {
    runtime.current?.overlay.setMeasureLabel((start, end) => measureLines(start, end, feed.candles, digits, ar));
  }, [feed.candles, digits, ar]);

  useEffect(() => { runtime.current?.overlay.setDrawings(drawings ?? []); }, [drawings, tf]);

  function selectFrame(next: Timeframe) {
    if (next === tf) return;
    chooseTool("crosshair");
    setHover(null);
    setSelected(null);
    setTf(next);
  }
  function reset() {
    if (!runtime.current) return;
    runtime.current.chart.priceScale("right").setAutoScale(true);
    toRecent(runtime.current);
  }
  function zoom(ratio: number) {
    const scale = runtime.current?.chart.timeScale();
    const range = scale?.getVisibleLogicalRange();
    if (!scale || !range) return;
    const width = Math.min(MAX_CHART_CANDLES + 6, Math.max(12, (range.to - range.from) * ratio));
    const center = (range.to + range.from) / 2;
    scale.setVisibleLogicalRange({ from: center - width / 2, to: center + width / 2 });
  }
  function setRange(days?: number) {
    const rt = runtime.current;
    if (!rt?.bars.length) return;
    if (!days) { rt.chart.timeScale().fitContent(); return; }
    const end = rt.bars[rt.bars.length - 1].openTime;
    const start = Math.max(rt.bars[0].openTime, end - days * 86_400_000);
    rt.chart.timeScale().setVisibleRange({ from: candleTime(start), to: candleTime(end) });
  }
  async function toggleFullscreen() {
    if (document.fullscreenElement === shell.current) { await document.exitFullscreen().catch(() => undefined); return; }
    if (expanded) { setExpanded(false); return; }
    try {
      if (!shell.current?.requestFullscreen) { setExpanded(true); return; }
      await shell.current.requestFullscreen();
    } catch { setExpanded(true); }
  }

  const status = feed.liveError ? (ar ? "تعذّر تحديث الشموع" : "Live update failed") : feed.fetchedAt && barCount ? (ar ? "بيانات البورصة" : "Exchange feed") : (ar ? "بانتظار البيانات" : "Awaiting data");
  const shortHistory = feed.exhausted && barCount < MAX_CHART_CANDLES;
  return (
    <section ref={shell} className={`tv-shell${expanded ? " tv-expanded" : ""}`} aria-label={ar ? "شارت التداول التفاعلي" : "Interactive trading chart"} dir="ltr">
      <div className="tv-topbar">
        <div className="tv-symbol"><CandlestickChart size={17} /><b>{symbol.replace(/USDT$/, "")}/USDT</b><span>{exchange} Spot</span></div>
        <div className="tv-divider" />
        <div className="tv-intervals" role="group" aria-label={ar ? "فريمات الشارت" : "Chart timeframes"}>
          {ALL_TIMEFRAMES.map((item) => <button type="button" key={item} aria-pressed={tf === item} className="tv-text-button" onClick={() => selectFrame(item)}>{item}</button>)}
        </div>
        <div className="tv-divider tv-secondary" />
        <div className="tv-actions">
          <ChartButton title={ar ? "حجم التداول" : "Volume"} active={showVolume} onClick={() => setVolume((value) => !value)}><BarChart3 size={16} /></ChartButton>
          <ChartButton title={ar ? "المتوسط المتحرك EMA 20" : "EMA 20 overlay"} active={showEma} onClick={() => setShowEma((value) => !value)}><Activity size={16} /></ChartButton>
          <ChartButton title={ar ? "أعد عرض أحدث الشموع" : "Reset to latest candles"} onClick={reset}><RotateCcw size={15} /></ChartButton>
          <ChartButton title={fullscreen || expanded ? (ar ? "إنهاء ملء الشاشة" : "Exit fullscreen") : (ar ? "ملء الشاشة" : "Fullscreen")} onClick={toggleFullscreen}>
            {fullscreen || expanded ? <Minimize size={16} /> : <Maximize size={16} />}
          </ChartButton>
        </div>
      </div>

      <div className="tv-body">
        <div className="tv-rail" role="group" aria-label={ar ? "أدوات الرسم والتكبير" : "Drawing and zoom tools"}>
          <ChartButton title={ar ? "المؤشر المتقاطع" : "Crosshair"} active={tool === "crosshair"} onClick={() => chooseTool("crosshair")}><Crosshair size={17} /></ChartButton>
          <ChartButton title={ar ? "خط اتجاه (نقطتان)" : "Trend line (two points)"} active={tool === "trend"} onClick={() => chooseTool(tool === "trend" ? "crosshair" : "trend")}><TrendingUp size={17} /></ChartButton>
          <ChartButton title={ar ? "خط أفقي" : "Horizontal line"} active={tool === "horizontal"} onClick={() => chooseTool(tool === "horizontal" ? "crosshair" : "horizontal")}><Minus size={17} /></ChartButton>
          <ChartButton title={ar ? "أداة القياس (نسبة الارتفاع والانخفاض)" : "Measure (rise / drop %)"} active={tool === "measure"} onClick={() => chooseTool(tool === "measure" ? "crosshair" : "measure")}><Ruler size={17} /></ChartButton>
          <div className="tv-rail-divider" />
          <ChartButton title={ar ? "تكبير الشارت" : "Zoom in"} onClick={() => zoom(0.75)} disabled={!barCount}><ZoomIn size={16} /></ChartButton>
          <ChartButton title={ar ? "تصغير الشارت" : "Zoom out"} onClick={() => zoom(1.33)} disabled={!barCount}><ZoomOut size={16} /></ChartButton>
          <ChartButton title={ar ? "التراجع عن آخر رسم" : "Undo last drawing"} onClick={() => setDrawingMap((prev) => ({ ...prev, [tf]: prev[tf]?.slice(0, -1) }))} disabled={!drawings?.length}><Undo2 size={16} /></ChartButton>
        </div>
        <div className={`tv-viewport${tool !== "crosshair" ? " tv-drawing" : ""}`}>
          <div ref={container} className="tv-canvas" />
          <div className="tv-legend" style={{ color: display && display.close < display.open ? DOWN : UP }}>
            <div className="tv-legend-heading"><b>{symbol.replace(/USDT$/, "")} / TetherUS</b><span>· {tf} · {exchange}</span></div>
            {display && <>
              <div className="tv-ohlc" title={`${TIME_FORMAT.format(display.openTime)} UTC`}>
                {([["O", display.open], ["H", display.high], ["L", display.low], ["C", display.close]] as const).map(([label, price]) => <span key={label}><small>{label}</small> {price.toFixed(digits)}</span>)}
                <span>{fmtPct(((display.close - display.open) / display.open) * 100)}</span>
              </div>
              {showVolume && <div className="tv-vol"><small>Vol</small> {VOLUME_FORMAT.format(display.volume)}</div>}
            </>}
            {showEma && <div className="tv-indicator">EMA 20</div>}
          </div>
          {!barCount && <div className="tv-chart-empty" role="status" dir={ar ? "rtl" : "ltr"}>
            {feed.loadingHistory ? (ar ? "جاري جلب الشموع من البورصة…" : "Loading candles from the exchange…") : (ar ? "لا تتوفر شموع لهذا الفريم الآن." : "No candles available for this timeframe.")}
          </div>}
          {tool !== "crosshair" && <span className="tv-tool-hint" dir={ar ? "rtl" : "ltr"}>
            {tool === "horizontal" ? (ar ? "اضغط لتحديد السعر" : "Click a price") : firstPoint ? (ar ? "حدد النقطة الثانية" : "Select the second point") : (ar ? "حدد النقطة الأولى" : "Select the first point")}
          </span>}
          {selectedCandle && <div className="tv-readout" role="status" dir={ar ? "rtl" : "ltr"}>
            <div className="tv-readout-head">
              <span dir="ltr">{TIME_FORMAT.format(selectedCandle.openTime)} UTC</span>
              <button type="button" aria-label={ar ? "إخفاء بيانات الشمعة" : "Hide candle details"} onClick={() => setSelected(null)}><X size={12} /></button>
            </div>
            <div className="tv-readout-row">
              <span>{ar ? "التغير (فتح ← إغلاق)" : "Change (open → close)"}</span>
              <b dir="ltr" style={{ color: selectedCandle.close >= selectedCandle.open ? UP : DOWN }}>{fmtPct(selectedChange)}</b>
            </div>
            <div className="tv-readout-row">
              <span>{ar ? "المدى (قاع ← قمة)" : "Range (low → high)"}</span>
              <b dir="ltr">{selectedRange.toFixed(2)}%</b>
            </div>
            <div className="tv-readout-ohlc" dir="ltr">
              {([["O", selectedCandle.open], ["H", selectedCandle.high], ["L", selectedCandle.low], ["C", selectedCandle.close]] as const).map(([label, value]) => <span key={label}>{label} {value.toFixed(digits)}</span>)}
            </div>
          </div>}
          <span className="sr-only" role="status">{measureText}</span>
        </div>
      </div>

      <div className="tv-footer">
        <div className="tv-ranges" role="group" aria-label={ar ? "نطاق العرض" : "Visible date range"}>
          {RANGES.map((range) => <button type="button" className="tv-text-button" key={range.label} disabled={!barCount} onClick={() => setRange(range.days)}>{range.label}</button>)}
          <button type="button" className="tv-text-button" disabled={!barCount} onClick={() => setRange()}>{ar ? "الكل" : "All"}</button>
        </div>
        <div className="tv-status" role="status">
          <span className={`tv-status-dot${feed.fetchedAt && barCount && !feed.liveError ? " tv-status-connected" : ""}`} />
          <span className="tv-status-title">{status}</span>
          <b className="font-num" aria-label={ar ? "عدد الشموع المحمّلة" : "Loaded candle count"}>{COUNT_FORMAT.format(barCount)} / {COUNT_FORMAT.format(MAX_CHART_CANDLES)}</b>
          {feed.loadingHistory && <RefreshCw size={12} className="tv-spinner" aria-label={ar ? "تحميل التاريخ" : "Loading history"} />}
        </div>
        <div className="tv-scale">
          <span>UTC</span>
          <button type="button" className="tv-text-button" aria-label={ar ? "مقياس لوغاريتمي" : "Log price scale"} aria-pressed={logScale} onClick={() => setLogScale((value) => !value)}>log</button>
          <button type="button" className="tv-text-button" title={ar ? "إعادة ضبط مقياس السعر" : "Auto-fit price scale"} onClick={() => runtime.current?.chart.priceScale("right").setAutoScale(true)}>auto</button>
        </div>
      </div>
      {(shortHistory || feed.historyError || feed.liveError) && <div className="tv-message" dir={ar ? "rtl" : "ltr"}>
        <span title={feed.historyError ?? feed.liveError ?? undefined}>
          {feed.liveError ? (ar ? "آخر الشموع المعروضة لم تُحدَّث. قد يكون المصدر غير متاح مؤقتًا." : "Displayed candles could not be refreshed. The source may be temporarily unavailable.") : feed.historyError ? (ar ? "تم تحميل جزء من التاريخ فقط من البورصة." : "Only part of the exchange history has been loaded.") : (ar ? "ده كل التاريخ المتاح لهذا الزوج على الفريم الحالي من البورصة." : "This is the available exchange history for this pair and timeframe.")}
        </span>
        {(feed.historyError || feed.liveError) && <button type="button" className="tv-text-button" onClick={retry}>{ar ? "إعادة المحاولة" : "Retry"}</button>}
      </div>}
    </section>
  );
}
