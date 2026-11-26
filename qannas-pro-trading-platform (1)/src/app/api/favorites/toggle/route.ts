import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, favorites } from "@/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const symbol = String(body.symbol || "").trim().toUpperCase();
    const exchange = body.exchange === "MEXC" ? "MEXC" : "BINANCE";
    const marketType = body.marketType === "STOCK" ? "STOCK" : "CRYPTO";

    if (!symbol) {
      return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
    }

    const existing = await db
      .select()
      .from(favorites)
      .where(and(eq(favorites.symbol, symbol), eq(favorites.exchange, exchange)))
      .limit(1);

    if (existing.length > 0) {
      await db
        .delete(favorites)
        .where(eq(favorites.id, existing[0].id));
      return NextResponse.json({ isFavorite: false, symbol, exchange });
    }

    await db
      .insert(favorites)
      .values({ symbol, exchange, marketType })
      .onConflictDoNothing();

    return NextResponse.json({ isFavorite: true, symbol, exchange });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
