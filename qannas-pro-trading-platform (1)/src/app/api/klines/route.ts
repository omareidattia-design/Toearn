import { NextRequest, NextResponse } from "next/server";
import { getExchangePairs, getKlineHistory } from "@/lib/exchanges";
import { MAX_CHART_CANDLES } from "@/lib/chart-data";
import { ALL_TIMEFRAMES, type Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const symbol = (sp.get("symbol") ?? "BTCUSDT").trim().toUpperCase();
  const exchange = (sp.get("exchange") ?? "BINANCE").trim().toUpperCase();
  const interval = (sp.get("interval") ?? "4h").trim() as Timeframe;
  const requested = Number(sp.get("limit") ?? 500);
  const before = sp.has("before") ? Number(sp.get("before")) : undefined;
  if (!symbol.endsWith("USDT") || symbol.length <= 4 || symbol.length > 64 || (exchange !== "BINANCE" && exchange !== "MEXC") || !ALL_TIMEFRAMES.includes(interval) || !Number.isSafeInteger(requested) || requested < 1 || (before !== undefined && (!Number.isSafeInteger(before) || before <= 1 || before > Date.now()))) {
    return NextResponse.json({ error: "Invalid Spot symbol, exchange, interval, limit or history cursor" }, { status: 400 });
  }

  try {
    const { pairs, status } = await getExchangePairs(exchange);
    if (!status.connected) return NextResponse.json({ error: status.error ?? `${exchange} Spot unavailable` }, { status: 502 });
    const pair = pairs.find((item) => item.symbol === symbol);
    if (!pair) return NextResponse.json({ error: "Active Spot USDT pair not found" }, { status: 404 });
    const limit = Math.min(MAX_CHART_CANDLES, requested);
    const page = await getKlineHistory(pair, interval, limit, before, req.signal);
    return NextResponse.json({ symbol, exchange, interval, limit, ...page });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message || "Failed to fetch live klines" }, { status: 502 });
  }
}
