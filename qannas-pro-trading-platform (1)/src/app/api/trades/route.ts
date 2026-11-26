import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, tradeEvents, trades } from "@/db";
import { monitorOpenTrades } from "@/lib/scanner";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await monitorOpenTrades();
    const [allTrades, events] = await Promise.all([
      db.select().from(trades).orderBy(desc(trades.openedAt)).limit(150),
      db.select().from(tradeEvents).orderBy(desc(tradeEvents.createdAt)).limit(250),
    ]);
    return NextResponse.json({ trades: allTrades, events });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
