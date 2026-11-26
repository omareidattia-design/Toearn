import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, signals } from "@/db";
import { STRATEGY_RULES } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const signalId = Number(id);
    if (!Number.isFinite(signalId)) {
      return NextResponse.json({ error: "Invalid signal ID" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(signals)
      .where(eq(signals.id, signalId))
      .limit(1);
    if (existing.length === 0) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    }

    const sig = existing[0];
    const body = await req.json();

    const stopLoss = Number(body.stopLoss ?? sig.stopLoss);
    const tp1 = Number(body.tp1 ?? sig.tp1);
    const tp2 = Number(body.tp2 ?? sig.tp2);
    const tp3 = Number(body.tp3 ?? sig.tp3);

    // Entry price is NEVER changed arbitrarily to fake a setup; validate SL < entry < tp1 < tp2 < tp3
    const entry = sig.entryPrice;
    if (!(stopLoss > 0 && stopLoss < entry && tp1 > entry && tp2 > tp1 && tp3 > tp2)) {
      return NextResponse.json(
        {
          error:
            "المستويات غير صالحة: يجب أن يكون الوقف أقل من الدخول والأهداف تصاعدية فوق الدخول",
        },
        { status: 400 }
      );
    }

    const risk = entry - stopLoss;
    const slPercent = -((risk / entry) * 100);
    const tp1Percent = ((tp1 - entry) / entry) * 100;
    if (tp1Percent < STRATEGY_RULES.MIN_PROFIT_PCT) {
      return NextResponse.json(
        { error: "لا يمكن خفض ربح الهدف الأول TP1 عن 2% كحد أدنى" },
        { status: 400 }
      );
    }
    const tp2Percent = ((tp2 - entry) / entry) * 100;
    const tp3Percent = ((tp3 - entry) / entry) * 100;
    const riskRewardTp2 = (tp2 - entry) / risk;
    const qty = STRATEGY_RULES.TRADE_SIZE_USDT / entry;
    const fees = sig.estimatedFeesUsdt;
    const expectedProfitTp2Usdt = qty * (tp2 - entry) - fees;
    const potentialLossUsdt = qty * risk + fees;

    const [updated] = await db
      .update(signals)
      .set({
        stopLoss,
        tp1,
        tp2,
        tp3,
        slPercent,
        tp1Percent,
        tp2Percent,
        tp3Percent,
        riskRewardTp2,
        expectedProfitTp2Usdt,
        potentialLossUsdt,
        updatedAt: new Date(),
      })
      .where(eq(signals.id, signalId))
      .returning();

    return NextResponse.json({ signal: updated });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
