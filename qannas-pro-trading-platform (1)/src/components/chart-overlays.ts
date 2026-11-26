import type {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type { ZoneBox } from "@/lib/types";

export type ChartPoint = { time: UTCTimestamp; price: number };
export type TwoPointShape = "trend" | "measure";
export type ChartDrawing =
  | { kind: "horizontal"; price: number }
  | { kind: TwoPointShape; start: ChartPoint; end: ChartPoint };

/** A small callout attached to one candle: the trade's first candle, or the tapped candle's change. */
export interface CandleFlag {
  time: UTCTimestamp;
  high: number;
  low: number;
  text: string;
  color: string;
  ink: string;
  side: "above" | "below";
}

/** Text lines for a measurement between two points (percent, price move, candles, elapsed time). */
export type MeasureLabel = (start: ChartPoint, end: ChartPoint) => string[];

const ARABIC = /[\u0600-\u06FF]/;
const ENTRY_COLOR = "#d4af37";

export function candleTime(ms: number): UTCTimestamp {
  return Math.floor(ms / 1_000) as UTCTimestamp;
}

export function chartOverlays(chart: IChartApi, series: ISeriesApi<"Candlestick", Time>, fontFamily: string) {
  let zones: ZoneBox[] = [];
  let drawings: ChartDrawing[] = [];
  let flags: CandleFlag[] = [];
  let pending: ChartPoint | null = null;
  let preview: ChartPoint | null = null;
  let pendingShape: TwoPointShape = "trend";
  let entryStart: ChartPoint | null = null;
  let measureLabel: MeasureLabel | null = null;
  let repaint: (() => void) | undefined;

  const labelFont = `600 11px ${fontFamily}`;
  const xOf = (time: number) => chart.timeScale().timeToCoordinate(candleTime(time));
  const xAt = (time: UTCTimestamp) => chart.timeScale().timeToCoordinate(time);
  const yOf = (price: number) => series.priceToCoordinate(price);

  function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, 4);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }
  function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
    ctx.direction = ARABIC.test(text) ? "rtl" : "ltr";
    ctx.fillText(text, x, y);
  }
  function arrow(ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
    if (Math.hypot(toX - fromX, toY - fromY) < 9) return;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - 6 * Math.cos(angle - 0.45), toY - 6 * Math.sin(angle - 0.45));
    ctx.lineTo(toX - 6 * Math.cos(angle + 0.45), toY - 6 * Math.sin(angle + 0.45));
    ctx.closePath();
    ctx.fill();
  }

  /** Shaded range between two points with its rise/drop label; green when the end is higher, red when lower. */
  function paintMeasure(ctx: CanvasRenderingContext2D, width: number, height: number, start: ChartPoint, end: ChartPoint) {
    const x1 = xAt(start.time);
    const x2 = xAt(end.time);
    const y1 = yOf(start.price);
    const y2 = yOf(end.price);
    if (x1 === null || x2 === null || y1 === null || y2 === null) return;
    const rising = end.price >= start.price;
    const rgb = rising ? "38,166,154" : "239,83,80";
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const top = Math.min(y1, y2);
    const bottom = Math.max(y1, y2);
    const pad = Math.max(0, (14 - (right - left)) / 2);
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(${rgb},.14)`;
    ctx.fillRect(left - pad, top, right - left + pad * 2, Math.max(1, bottom - top));
    ctx.strokeStyle = `rgb(${rgb})`;
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.lineWidth = 1;
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    arrow(ctx, midX, y1, midX, y2);
    if (right - left >= 14) arrow(ctx, x1, midY, x2, midY);

    const lines = measureLabel?.(start, end) ?? [];
    if (lines.length) {
      ctx.font = labelFont;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const boxW = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 16;
      const boxH = lines.length * 15 + 8;
      const boxX = Math.min(Math.max(4, midX - boxW / 2), Math.max(4, width - boxW - 4));
      // The label sits past the end of the move, pulled back inside the chart when there is no room.
      const boxY = Math.min(Math.max(4, rising ? top - boxH - 7 : bottom + 7), Math.max(4, height - boxH - 4));
      ctx.fillStyle = `rgba(${rgb},.95)`;
      box(ctx, boxX, boxY, boxW, boxH);
      ctx.fillStyle = "#ffffff";
      lines.forEach((line, row) => label(ctx, line, boxX + boxW / 2, boxY + 4 + row * 15 + 8));
    }
    ctx.restore();
  }

  function paintFlag(ctx: CanvasRenderingContext2D, width: number, height: number, flag: CandleFlag) {
    const x = xAt(flag.time);
    const high = yOf(flag.high);
    const low = yOf(flag.low);
    if (x === null || high === null || low === null || x < 0 || x > width) return;
    ctx.save();
    ctx.font = labelFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const pillW = ctx.measureText(flag.text).width + 12;
    const pillH = 17;
    const tip = 6;
    const gap = 4;
    const needed = gap + tip + pillH;
    // Keep the requested side unless the callout would be cut off there and fits on the other side.
    let above = flag.side === "above";
    if (above && high - needed < 0 && low + needed <= height) above = false;
    else if (!above && low + needed > height && high - needed >= 0) above = true;
    const tipY = above ? high - gap : low + gap;
    const baseY = above ? tipY - tip : tipY + tip;
    const pillX = Math.min(Math.max(2, x - pillW / 2), Math.max(2, width - pillW - 2));
    const pillY = above ? baseY - pillH : baseY;
    ctx.fillStyle = flag.color;
    ctx.beginPath();
    ctx.moveTo(x, tipY);
    ctx.lineTo(x - 5, baseY);
    ctx.lineTo(x + 5, baseY);
    ctx.closePath();
    ctx.fill();
    box(ctx, pillX, pillY, pillW, pillH);
    ctx.fillStyle = flag.ink;
    label(ctx, flag.text, pillX + pillW / 2, pillY + pillH / 2 + 1);
    ctx.restore();
  }

  const zoneRenderer: IPrimitivePaneRenderer = {
    draw(target) {
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
        for (const z of zones) {
          const left = xOf(z.startTime);
          const right = xOf(z.endTime);
          const top = yOf(z.high);
          const bottom = yOf(z.low);
          if (left === null || right === null || top === null || bottom === null || right < 0 || left > mediaSize.width) continue;
          const x = Math.max(0, left);
          const w = Math.max(1, Math.min(mediaSize.width, right + 4) - x);
          const h = Math.max(1, bottom - top);
          const isOb = z.type === "OB";
          ctx.fillStyle = isOb ? "rgba(212,175,55,.10)" : "rgba(38,166,154,.10)";
          ctx.strokeStyle = isOb ? "rgba(212,175,55,.37)" : "rgba(38,166,154,.36)";
          ctx.lineWidth = 1;
          ctx.fillRect(x, top, w, h);
          ctx.strokeRect(x, top, w, h);
          if (w >= 32 && h >= 12) {
            ctx.font = "500 10px system-ui";
            ctx.fillStyle = isOb ? "#d4af37" : "#67c4b9";
            ctx.fillText(z.type, x + 5, top + 10);
          }
        }
      });
    },
  };
  const drawingRenderer: IPrimitivePaneRenderer = {
    draw(target) {
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
        const { width, height } = mediaSize;
        if (entryStart) {
          const x = xAt(entryStart.time);
          const y = yOf(entryStart.price);
          // The entry line begins at the candle that opened the trade instead of crossing older history.
          const from = x === null ? null : Math.round(x - chart.timeScale().options().barSpacing / 2) + 0.5;
          if (from !== null && y !== null && from < width) {
            const lineY = Math.round(y) + 0.5;
            ctx.strokeStyle = ENTRY_COLOR;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(Math.max(0, from), lineY);
            ctx.lineTo(width, lineY);
            if (from >= 0) {
              ctx.moveTo(from, lineY - 4);
              ctx.lineTo(from, lineY + 4);
            }
            ctx.stroke();
          }
        }
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = "#e1bb55";
        ctx.fillStyle = "#e1bb55";
        function paint(d: ChartDrawing) {
          if (d.kind === "horizontal") {
            const y = yOf(d.price);
            if (y === null) return;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
            return;
          }
          if (d.kind === "measure") {
            paintMeasure(ctx, width, height, d.start, d.end);
            return;
          }
          const x1 = xAt(d.start.time);
          const x2 = xAt(d.end.time);
          const y1 = yOf(d.start.price);
          const y2 = yOf(d.end.price);
          if (x1 === null || x2 === null || y1 === null || y2 === null) return;
          ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        }
        drawings.forEach(paint);
        if (pending && preview) {
          if (pendingShape === "measure") paintMeasure(ctx, width, height, pending, preview);
          else {
            ctx.setLineDash([4, 4]);
            paint({ kind: "trend", start: pending, end: preview });
            ctx.setLineDash([]);
          }
        }
        if (pending) {
          const x = xAt(pending.time);
          const y = yOf(pending.price);
          if (x !== null && y !== null) {
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
          }
        }
        for (const flag of flags) paintFlag(ctx, width, height, flag);
      });
    },
  };
  const views: IPrimitivePaneView[] = [
    { zOrder: () => "bottom", renderer: () => zoneRenderer },
    { zOrder: () => "top", renderer: () => drawingRenderer },
  ];
  const primitive: ISeriesPrimitive<Time> = {
    paneViews: () => views,
    attached: ({ requestUpdate }) => { repaint = requestUpdate; },
    detached: () => { repaint = undefined; },
  };
  series.attachPrimitive(primitive);

  return {
    setZones(value: ZoneBox[]) { zones = value; repaint?.(); },
    setDrawings(value: ChartDrawing[]) { drawings = value; repaint?.(); },
    setFlags(value: CandleFlag[]) { flags = value; repaint?.(); },
    setEntryStart(value: ChartPoint | null) { entryStart = value; repaint?.(); },
    setMeasureLabel(value: MeasureLabel) { measureLabel = value; repaint?.(); },
    setPointer(value: ChartPoint | null, hover: ChartPoint | null, shape: TwoPointShape = "trend") {
      pending = value;
      preview = hover;
      pendingShape = shape;
      repaint?.();
    },
  };
}
