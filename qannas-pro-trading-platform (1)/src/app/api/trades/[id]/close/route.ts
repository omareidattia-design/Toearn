import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tradeEvents, trades } from "@/db";
import { getExchangeTickers } from "@/lib/exchanges";
import { formatPriceCompact } from "@/lib/smc-engine";
import { ExchangeId } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const tradeId = Number(id);
    if (!Number.isFinite(tradeId)) {
      return NextResponse.json({ error: "Invalid trade ID" }, { status: 400 });
    }

    const rows = await db
      .select()
      .from(trades)
      .where(eq(trades.id, tradeId))
      .limit(1);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    const tr = rows[0];
    if (tr.status !== "OPEN") {
      return NextResponse.json({ error: "الصفقة مغلقة بالفعل" }, { status: 400 });
    }

    const tickers = await getExchangeTickers(tr.exchange as ExchangeId);
    const livePrice = tickers.get(tr.symbol)?.lastPrice ?? tr.lastPrice;
    const grossPnl = (livePrice - tr.entryPrice) * tr.quantity;
    const netPnl = grossPnl - tr.estimatedFeesUsdt;
    const netPnlPct = (netPnl / tr.tradeSizeUsdt) * 100;
    const now = new Date();

    const [closed] = await db
      .update(trades)
      .set({
        status: "CLOSED_MANUAL",
        lastPrice: livePrice,
        closePrice: livePrice,
        closeReason: "MANUAL_CLOSE",
        unrealizedPnlUsdt: 0,
        unrealizedPnlPercent: 0,
        realizedPnlUsdt: netPnl,
        realizedPnlPercent: netPnlPct,
        closedAt: now,
        updatedAt: now,
      })
      .where(eq(trades.id, tradeId))
      .returning();

    await db.insert(tradeEvents).values({
      tradeId: tr.id,
      eventType: "CLOSED_MANUAL",
      price: livePrice,
      pnlUsdt: netPnl,
      messageAr: `إغلاق يدوي للصفقة عند السعر الحي ${formatPriceCompact(livePrice)} · صافي الربح/الخسارة ${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} USDT (${netPnlPct >= 0 ? "+" : ""}${netPnlPct.toFixed(2)}%)`,
      messageEn: `Manually closed trade at live price ${formatPriceCompact(livePrice)} · Net PnL ${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} USDT (${netPnlPct >= 0 ? "+" : ""}${netPnlPct.toFixed(2)}%)`,
    });

    return NextResponse.json({ trade: closed });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
