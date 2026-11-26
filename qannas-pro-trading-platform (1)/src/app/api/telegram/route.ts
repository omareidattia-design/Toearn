import { NextRequest, NextResponse } from "next/server";
import { clearTelegramConfig, getTelegramStatus, queueTelegramTest, saveTelegramConfig, saveTelegramMode } from "@/lib/telegram";
import { TELEGRAM_MODES, type TelegramMode } from "@/lib/telegram-model";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getTelegramStatus(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  if (!req.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "INVALID_VERB" }, { status: 415 });
  const body = await req.json().catch(() => null);
  try {
    if (body?.action === "mode" && TELEGRAM_MODES.includes(body.mode as TelegramMode)) {
      await saveTelegramMode(body.mode);
      return NextResponse.json({ ok: true });
    }
    if (body?.action === "save_config") {
      // Secrets are written straight to the server table and never echoed back.
      const result = await saveTelegramConfig(String(body.token ?? ""), String(body.chatId ?? ""));
      if (result.outcome !== "SAVED") return NextResponse.json({ error: result.outcome }, { status: 400 });
      return NextResponse.json({ ok: true, status: await getTelegramStatus() }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body?.action === "clear_config") {
      await clearTelegramConfig();
      return NextResponse.json({ ok: true, status: await getTelegramStatus() }, { headers: { "Cache-Control": "no-store" } });
    }
    if (body?.action === "test") {
      const result = await queueTelegramTest();
      if (result.outcome === "MISSING_CONFIGURATION") return NextResponse.json({ error: result.outcome }, { status: 409 });
      if (result.outcome === "COOLDOWN") return NextResponse.json({ error: result.outcome }, { status: 429 });
      return NextResponse.json({ status: result.outcome, id: result.id }, { status: 202 });
    }
    return NextResponse.json({ error: "INVALID_ACTION" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 503 });
  }
}
