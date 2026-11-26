import { NextRequest, NextResponse } from "next/server";
import { and, eq, gte, gt } from "drizzle-orm";
import { db, favorites, signals, trades } from "@/db";
import { analyzeSingleSymbolLive } from "@/lib/scanner";
import type { SavedChartPlan } from "@/lib/chart-data";
import { ALL_TIMEFRAMES, STRATEGY_RULES, type ExchangeId, type Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const symbol = (sp.get("symbol") || "BTCUSDT").trim().toUpperCase();
    const exchangeRaw = (sp.get("exchange") || "BINANCE").trim().toUpperCase();
    const exchange: ExchangeId = exchangeRaw === "MEXC" ? "MEXC" : "BINANCE";
    const tfRaw = (sp.get("timeframe") || "4h").trim() as Timeframe;
    const timeframe: Timeframe = ALL_TIMEFRAMES.includes(tfRaw) ? tfRaw : "4h";

    const [{ analysis, candles }, favRow, openTradeRow, activeSignalRow] =
      await Promise.all([
        analyzeSingleSymbolLive({ symbol, exchange, timeframe }),
        db
          .select()
          .from(favorites)
          .where(
            and(eq(favorites.symbol, symbol), eq(favorites.exchange, exchange))
          )
          .limit(1),
        db
          .select()
          .from(trades)
          .where(
            and(
              eq(trades.symbol, symbol),
              eq(trades.exchange, exchange),
              eq(trades.status, "OPEN")
            )
          )
          .limit(1),
        db
          .select()
          .from(signals)
          .where(
            and(
              eq(signals.symbol, symbol),
              eq(signals.exchange, exchange),
              eq(signals.status, "ACTIVE"),
              gt(signals.expiresAt, new Date()),
              gte(signals.tp1Percent, STRATEGY_RULES.MIN_PROFIT_PCT)
            )
          )
          .limit(1),
      ]);

    const active = activeSignalRow[0];
    const opened = openTradeRow[0];
    const saved = opened ?? active;
    const origin = opened?.signalId
      ? (await db.select({ snapshot: signals.analysisSnapshot, discoveredAt: signals.discoveredAt }).from(signals).where(eq(signals.id, opened.signalId)).limit(1))[0]
      : undefined;
    const linked = opened?.signalId ? origin?.snapshot : active?.analysisSnapshot;
    // A tracked trade keeps the entry price fixed when its setup was discovered, so that is the candle it starts from.
    const startedAt = opened ? origin?.discoveredAt ?? opened.openedAt : active?.discoveredAt;
    const chartPlan: SavedChartPlan | null = saved ? {
      entry: saved.entryPrice,
      stopLoss: saved.stopLoss,
      tp1: saved.tp1,
      tp2: saved.tp2,
      tp3: saved.tp3,
      timeframe: saved.primaryTimeframe as Timeframe,
      zones: Array.isArray(linked?.zones) ? linked.zones : [],
      startedAt: startedAt ? startedAt.toISOString() : null,
    } : null;

    return NextResponse.json({
      analysis,
      chartPlan,
      candles,
      isFavorite: favRow.length > 0,
      openTrade: openTradeRow[0] ?? null,
      activeSignal: activeSignalRow[0] ?? null,
    });
  } catch (err) {
    console.error("[API /analyze] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Analysis failed" },
      { status: 500 }
    );
  }
}
