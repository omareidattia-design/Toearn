import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import {
  db,
  favorites,
  notifications,
  signals,
  tradeEvents,
  trades,
} from "@/db";
import {
  getAllDiscoveredPairs,
  getExchangeTickers,
  getMarketContext,
} from "@/lib/exchanges";
import {
  expireOldSignals,
  getLatestScanJobSummary,
  getOrCreateSettings,
  getRecentScanJobs,
  monitorOpenTrades,
} from "@/lib/scanner";
import { ensureServerSchedulerStarted } from "@/lib/scheduler";
import { STRATEGY_RULES } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    ensureServerSchedulerStarted();
    await expireOldSignals();

    const [
      cfg,
      discovery,
      binanceTickers,
      mexcTickers,
      btcContext,
      latestScan,
      recentScans,
      activeSignalsRaw,
      allTradesRaw,
      favRows,
      notifRows,
    ] = await Promise.all([
      getOrCreateSettings(),
      getAllDiscoveredPairs(false),
      getExchangeTickers("BINANCE"),
      getExchangeTickers("MEXC"),
      getMarketContext(),
      getLatestScanJobSummary(),
      getRecentScanJobs(6),
      db
        .select()
        .from(signals)
        .where(eq(signals.status, "ACTIVE"))
        .orderBy(desc(signals.score), desc(signals.discoveredAt))
        .then((rows) => rows.filter((r) => r.tp1Percent >= STRATEGY_RULES.MIN_PROFIT_PCT)),
      db.select().from(trades).orderBy(desc(trades.openedAt)).limit(100),
      db.select().from(favorites).orderBy(desc(favorites.createdAt)),
      db
        .select()
        .from(notifications)
        .orderBy(desc(notifications.createdAt))
        .limit(60),
    ]);

    // Trigger lightweight live monitoring if there are open trades
    if (allTradesRaw.some((t) => t.status === "OPEN")) {
      void monitorOpenTrades();
    }

    const recentEvents = await db
      .select()
      .from(tradeEvents)
      .orderBy(desc(tradeEvents.createdAt))
      .limit(120);

    const eventsByTrade = new Map<number, typeof recentEvents>();
    for (const ev of recentEvents) {
      const arr = eventsByTrade.get(ev.tradeId) ?? [];
      arr.push(ev);
      eventsByTrade.set(ev.tradeId, arr);
    }

    // Enrich signals with real-time current price
    const activeSignals = activeSignalsRaw.map((sig) => {
      const tMap = sig.exchange === "BINANCE" ? binanceTickers : mexcTickers;
      const tick = tMap.get(sig.symbol);
      const livePrice = tick?.lastPrice ?? sig.currentPriceAtDiscovery;
      const priceDiffFromEntryPct =
        sig.entryPrice > 0
          ? ((livePrice - sig.entryPrice) / sig.entryPrice) * 100
          : 0;
      return {
        ...sig,
        livePrice,
        priceDiffFromEntryPct,
        change24h: tick?.priceChangePercent ?? 0,
        volume24h: tick?.quoteVolume ?? 0,
      };
    });

    // Enrich trades with real-time live PnL (entryPrice is NEVER mutated!)
    const enrichedTrades = allTradesRaw.map((tr) => {
      const tMap = tr.exchange === "BINANCE" ? binanceTickers : mexcTickers;
      const tick = tMap.get(tr.symbol);
      const livePrice =
        tr.status === "OPEN" ? (tick?.lastPrice ?? tr.lastPrice) : (tr.closePrice ?? tr.lastPrice);
      const grossPnl = (livePrice - tr.entryPrice) * tr.quantity;
      const netPnl = grossPnl - tr.estimatedFeesUsdt;
      const netPnlPct = (netPnl / tr.tradeSizeUsdt) * 100;
      const remainingToTp1Pct =
        livePrice > 0 && tr.tp1 > livePrice
          ? ((tr.tp1 - livePrice) / livePrice) * 100
          : 0;

      return {
        ...tr,
        livePrice,
        unrealizedPnlUsdt: tr.status === "OPEN" ? netPnl : 0,
        unrealizedPnlPercent: tr.status === "OPEN" ? netPnlPct : 0,
        remainingToTp1Pct,
        events: eventsByTrade.get(tr.id) ?? [],
      };
    });

    const openTrades = enrichedTrades.filter((t) => t.status === "OPEN");
    const closedTrades = enrichedTrades.filter((t) => t.status !== "OPEN");

    const unrealizedTotal = openTrades.reduce(
      (sum, t) => sum + t.unrealizedPnlUsdt,
      0
    );
    const realizedTotal = closedTrades.reduce(
      (sum, t) => sum + (t.realizedPnlUsdt ?? 0),
      0
    );
    const activeCapital = openTrades.length * STRATEGY_RULES.TRADE_SIZE_USDT;

    // Live Ticker Tape: Top major liquid Spot pairs + tokenized stocks from live feeds
    const tapeSymbols = [
      "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "ADAUSDT",
      "DOGEUSDT", "SUIUSDT", "LINKUSDT", "AVAXUSDT", "TONUSDT", "TAOUSDT",
      "TSLAONUSDT", "NVDAONUSDT", "AAPLONUSDT", "COINONUSDT",
    ];
    const tickerTape = tapeSymbols
      .map((sym) => {
        const b = binanceTickers.get(sym);
        const m = mexcTickers.get(sym);
        const t = b ?? m;
        if (!t) return null;
        return {
          symbol: sym,
          baseAsset: sym.replace(/USDT$/, ""),
          exchange: t.exchange,
          price: t.lastPrice,
          change24h: t.priceChangePercent,
          marketType: sym.endsWith("ONUSDT") ? "STOCK" : "CRYPTO",
        };
      })
      .filter(Boolean);

    const cryptoCount =
      discovery.statuses.BINANCE.cryptoCount +
      discovery.statuses.MEXC.cryptoCount;
    const stockCount =
      discovery.statuses.BINANCE.stockCount +
      discovery.statuses.MEXC.stockCount;

    return NextResponse.json({
      settings: cfg,
      exchanges: discovery.statuses,
      counts: {
        totalDiscovered: discovery.pairs.length,
        cryptoCount,
        stockCount,
        excludedCount: 0,
        activeSignalsCount: activeSignals.length,
        openTradesCount: openTrades.length,
        favoritesCount: favRows.length,
        unreadNotificationsCount: notifRows.filter((n) => !n.isRead).length,
      },
      btcContext,
      latestScan,
      recentScans,
      signals: activeSignals,
      trades: enrichedTrades,
      portfolio: {
        tradeSizeUsdt: STRATEGY_RULES.TRADE_SIZE_USDT,
        activeCapitalUsdt: activeCapital,
        unrealizedPnlUsdt: unrealizedTotal,
        realizedPnlUsdt: realizedTotal,
        totalPnlUsdt: unrealizedTotal + realizedTotal,
        totalValueUsdt: activeCapital + unrealizedTotal,
        openCount: openTrades.length,
        closedCount: closedTrades.length,
        winningClosedCount: closedTrades.filter((t) => (t.realizedPnlUsdt ?? 0) > 0).length,
      },
      favorites: favRows,
      notifications: notifRows,
      tickerTape,
      strategyRules: STRATEGY_RULES,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[API /bootstrap] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Bootstrap failed" },
      { status: 500 }
    );
  }
}
