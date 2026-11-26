import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, favorites, signals, trades } from "@/db";
import { getAllDiscoveredPairs, getExchangeTickers } from "@/lib/exchanges";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const market = (sp.get("market") || "ALL").toUpperCase(); // ALL | CRYPTO | STOCK | FAVORITES
    const exchange = (sp.get("exchange") || "ALL").toUpperCase(); // ALL | BINANCE | MEXC
    const sector = sp.get("sector") || "ALL";
    const search = (sp.get("search") || "").trim().toUpperCase();
    const sort = sp.get("sort") || "VOLUME"; // VOLUME | GAINERS | LOSERS | PRICE
    const limit = Math.min(2500, Math.max(20, Number(sp.get("limit") || 200)));
    const offset = Math.max(0, Number(sp.get("offset") || 0));

    const [{ pairs, statuses }, binanceTickers, mexcTickers, favs, activeSigs, openTrades] =
      await Promise.all([
        getAllDiscoveredPairs(false),
        getExchangeTickers("BINANCE"),
        getExchangeTickers("MEXC"),
        db.select().from(favorites),
        db
          .select({
            symbol: signals.symbol,
            exchange: signals.exchange,
            score: signals.score,
            primaryTimeframe: signals.primaryTimeframe,
          })
          .from(signals)
          .where(eq(signals.status, "ACTIVE")),
        db
          .select({
            symbol: trades.symbol,
            exchange: trades.exchange,
          })
          .from(trades)
          .where(eq(trades.status, "OPEN")),
      ]);

    const favSet = new Set(favs.map((f) => `${f.exchange}:${f.symbol}`));
    const sigMap = new Map(activeSigs.map((s) => [`${s.exchange}:${s.symbol}`, s]));
    const openTradeSet = new Set(openTrades.map((t) => `${t.exchange}:${t.symbol}`));

    let items = pairs.map((p) => {
      const tick = (p.exchange === "BINANCE" ? binanceTickers : mexcTickers).get(p.symbol);
      const key = `${p.exchange}:${p.symbol}`;
      const sig = sigMap.get(key);
      return {
        symbol: p.symbol,
        baseAsset: p.baseAsset,
        exchange: p.exchange,
        marketType: p.marketType,
        sector: p.sector,
        fullName: p.fullName ?? null,
        lastPrice: tick?.lastPrice ?? 0,
        priceChangePercent: tick?.priceChangePercent ?? 0,
        highPrice: tick?.highPrice ?? 0,
        lowPrice: tick?.lowPrice ?? 0,
        quoteVolume: tick?.quoteVolume ?? 0,
        spreadPct: tick?.spreadPct ?? 0,
        isFavorite: favSet.has(key),
        hasActiveSignal: Boolean(sig),
        activeSignalScore: sig?.score ?? null,
        activeSignalTf: sig?.primaryTimeframe ?? null,
        hasOpenTrade: openTradeSet.has(key),
      };
    });

    if (exchange === "BINANCE" || exchange === "MEXC") {
      items = items.filter((i) => i.exchange === exchange);
    }
    if (market === "CRYPTO") {
      items = items.filter((i) => i.marketType === "CRYPTO");
    } else if (market === "STOCK") {
      items = items.filter((i) => i.marketType === "STOCK");
    } else if (market === "FAVORITES") {
      items = items.filter((i) => i.isFavorite);
    }

    if (sector && sector !== "ALL") {
      if (sector === "GAINERS") {
        items = items.filter((i) => i.priceChangePercent > 0 && i.quoteVolume > 50_000);
      } else if (sector === "LOSERS") {
        items = items.filter((i) => i.priceChangePercent < 0 && i.quoteVolume > 50_000);
      } else {
        items = items.filter((i) => i.sector === sector);
      }
    }

    if (search) {
      items = items.filter(
        (i) =>
          i.symbol.includes(search) ||
          i.baseAsset.includes(search) ||
          (i.fullName && i.fullName.toUpperCase().includes(search))
      );
    }

    if (sort === "GAINERS" || sector === "GAINERS") {
      items.sort((a, b) => b.priceChangePercent - a.priceChangePercent);
    } else if (sort === "LOSERS" || sector === "LOSERS") {
      items.sort((a, b) => a.priceChangePercent - b.priceChangePercent);
    } else if (sort === "SCORE") {
      items.sort(
        (a, b) =>
          (b.activeSignalScore ?? -1) - (a.activeSignalScore ?? -1) ||
          b.quoteVolume - a.quoteVolume
      );
    } else {
      items.sort((a, b) => b.quoteVolume - a.quoteVolume);
    }

    const totalFiltered = items.length;
    const paged = items.slice(offset, offset + limit);

    return NextResponse.json({
      totalDiscovered: pairs.length,
      excludedCount: 0,
      totalFiltered,
      exchanges: statuses,
      items: paged,
    });
  } catch (err) {
    console.error("[API /markets] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to load markets" },
      { status: 500 }
    );
  }
}
