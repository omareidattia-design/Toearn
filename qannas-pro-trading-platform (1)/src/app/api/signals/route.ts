import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, signals } from "@/db";
import { expireOldSignals } from "@/lib/scanner";
import { STRATEGY_RULES } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await expireOldSignals();
    const status = req.nextUrl.searchParams.get("status") || "ACTIVE";
    const rawRows =
      status === "ALL"
        ? await db.select().from(signals).orderBy(desc(signals.discoveredAt)).limit(150)
        : await db
            .select()
            .from(signals)
            .where(eq(signals.status, status))
            .orderBy(desc(signals.score), desc(signals.discoveredAt))
            .limit(150);
    const rows = rawRows.filter((r) => r.tp1Percent >= STRATEGY_RULES.MIN_PROFIT_PCT);
    return NextResponse.json({ signals: rows });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
