import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, tradeEvents, trades } from "@/db";
import { formatPriceCompact } from "@/lib/smc-engine";

export const dynamic = "force-dynamic";

/**
 * Allows updating SL / TP1 / TP2 / TP3 on an open trade.
 * CRITICAL RULE: entryPrice is FROZEN and NEVER modified under any circumstance!
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const tradeId = Number(id);
    if (!Number.isFinite(tradeId)) {
      return NextResponse.json({ error: "Invalid trade ID" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(trades)
      .where(eq(trades.id, tradeId))
      .limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    const tr = existing[0];
    if (tr.status !== "OPEN") {
      return NextResponse.json(
        { error: "لا يمكن تعديل صفقة مغلقة" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const stopLoss = Number(body.stopLoss ?? tr.stopLoss);
    const tp1 = Number(body.tp1 ?? tr.tp1);
    const tp2 = Number(body.tp2 ?? tr.tp2);
    const tp3 = Number(body.tp3 ?? tr.tp3);

    // Entry price stays 100% frozen (tr.entryPrice)
    if (!(stopLoss > 0 && stopLoss < tr.entryPrice && tp1 > tr.entryPrice && tp2 > tp1 && tp3 > tp2)) {
      return NextResponse.json(
        {
          error:
            "المستويات غير صالحة: الوقف يجب أن يكون أقل من الدخول المجمّد والأهداف تصاعدية فوقه",
        },
        { status: 400 }
      );
    }

    const [updated] = await db
      .update(trades)
      .set({
        stopLoss,
        tp1,
        tp2,
        tp3,
        updatedAt: new Date(),
      })
      .where(eq(trades.id, tradeId))
      .returning();

    await db.insert(tradeEvents).values({
      tradeId: tr.id,
      eventType: "LEVELS_UPDATED",
      price: tr.lastPrice,
      messageAr: `تم تحديث مستويات الوقف/الأهداف مع بقاء الدخول مجمّدًا عند ${formatPriceCompact(tr.entryPrice)} (SL ${formatPriceCompact(stopLoss)} · TP1 ${formatPriceCompact(tp1)} · TP2 ${formatPriceCompact(tp2)} · TP3 ${formatPriceCompact(tp3)})`,
      messageEn: `Updated SL/TP levels while entry stayed frozen at ${formatPriceCompact(tr.entryPrice)} (SL ${formatPriceCompact(stopLoss)} · TP1 ${formatPriceCompact(tp1)})`,
    });

    return NextResponse.json({ trade: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
