import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, notifications } from "@/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.id) {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.id, Number(body.id)));
    } else {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.isRead, false));
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
