import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db, notifications } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(100);
    return NextResponse.json({
      notifications: rows,
      unreadCount: rows.filter((n) => !n.isRead).length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
