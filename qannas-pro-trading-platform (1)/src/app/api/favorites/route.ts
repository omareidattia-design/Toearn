import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, favorites } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db.select().from(favorites).orderBy(desc(favorites.createdAt));
    return NextResponse.json({ favorites: rows });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
