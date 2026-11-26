import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, trades } from "@/db";
import { getAllDiscoveredPairs, getExchangeTickers } from "@/lib/exchanges";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [{ pairs, statuses }, binanceTickers, mexcTickers, openTrades] =
      await Promise.all([
        getAllDiscoveredPairs(false),
        getExchangeTickers("BINANCE"),
        getExchangeTickers("MEXC"),
        db.select().from(trades).where(eq(trades.status, "OPEN")),
      ]);

    const binanceSet = new Set(
      pairs.filter((p) => p.exchange === "BINANCE").map((p) => p.symbol)
    );
    const mexcPairs = pairs.filter((p) => p.exchange === "MEXC");

    const sharedSymbols: string[] = [];
    const spreads: Array<{
      symbol: string;
      baseAsset: string;
      binancePrice: number;
      mexcPrice: number;
      spreadPct: number;
      cheaperExchange: "BINANCE" | "MEXC";
      binanceVolume24h: number;
      mexcVolume24h: number;
    }> = [];

    let anomaliesIgnored = 0;

    for (const mp of mexcPairs) {
      if (!binanceSet.has(mp.symbol)) continue;
      sharedSymbols.push(mp.symbol);
      const bt = binanceTickers.get(mp.symbol);
      const mt = mexcTickers.get(mp.symbol);
      if (!bt || !mt || bt.lastPrice <= 0 || mt.lastPrice <= 0) continue;

      const minP = Math.min(bt.lastPrice, mt.lastPrice);
      const spreadPct = (Math.abs(bt.lastPrice - mt.lastPrice) / minP) * 100;

      // Per spec: ignore anomalous price gaps above 10% (different tickers sharing symbol name)
      if (spreadPct > 10) {
        anomaliesIgnored++;
        continue;
      }

      spreads.push({
        symbol: mp.symbol,
        baseAsset: mp.baseAsset,
        binancePrice: bt.lastPrice,
        mexcPrice: mt.lastPrice,
        spreadPct,
        cheaperExchange: bt.lastPrice <= mt.lastPrice ? "BINANCE" : "MEXC",
        binanceVolume24h: bt.quoteVolume,
        mexcVolume24h: mt.quoteVolume,
      });
    }

    spreads.sort((a, b) => b.spreadPct - a.spreadPct);

    // Real Risk Summary calculated STRICTLY from actual open trades!
    let totalExposureUsdt = 0;
    let totalPotentialLossUsdt = 0;
    let maxSingleTradeRiskUsdt = 0;
    let maxRiskSymbol: string | null = null;

    const tradeProximity = openTrades.map((t) => {
      const tick = (t.exchange === "BINANCE" ? binanceTickers : mexcTickers).get(t.symbol);
      const livePrice = tick?.lastPrice ?? t.lastPrice;
      const riskAtSlUsdt =
        (t.entryPrice - t.stopLoss) * t.quantity + t.estimatedFeesUsdt;
      const distanceToSlPct =
        livePrice > 0 ? ((livePrice - t.stopLoss) / livePrice) * 100 : 0;

      totalExposureUsdt += t.tradeSizeUsdt;
      totalPotentialLossUsdt += Math.max(0, riskAtSlUsdt);
      if (riskAtSlUsdt > maxSingleTradeRiskUsdt) {
        maxSingleTradeRiskUsdt = riskAtSlUsdt;
        maxRiskSymbol = `${t.symbol} (${t.exchange})`;
      }

      return {
        tradeId: t.id,
        symbol: t.symbol,
        exchange: t.exchange,
        entryPrice: t.entryPrice,
        livePrice,
        stopLoss: t.stopLoss,
        distanceToSlPct,
        riskAtSlUsdt,
        nearStopWarning: distanceToSlPct <= 1.5,
      };
    });

    tradeProximity.sort((a, b) => a.distanceToSlPct - b.distanceToSlPct);

    return NextResponse.json({
      exchanges: statuses,
      sharedPairsCount: sharedSymbols.length,
      displayedSpreadsCount: spreads.length,
      anomaliesIgnored,
      spreads: spreads.slice(0, 120),
      riskSummary: {
        openTradesCount: openTrades.length,
        totalExposureUsdt,
        totalPotentialLossUsdt,
        maxSingleTradeRiskUsdt,
        maxRiskSymbol,
        closestToStop: tradeProximity[0] ?? null,
        tradeProximity,
      },
    });
  } catch (err) {
    console.error("[API /spreads] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to load spreads" },
      { status: 500 }
    );
  }
}
