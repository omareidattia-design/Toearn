import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { getOrCreateSettings } from "@/lib/scanner";
import { ALL_TIMEFRAMES, STRATEGY_RULES, Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const cfg = await getOrCreateSettings();
    return NextResponse.json({ settings: cfg });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await getOrCreateSettings();
    const body = await req.json();

    const update: Record<string, unknown> = {
      updatedAt: new Date(),
      // Non-negotiable fixed constants enforced on server
      scoreThreshold: STRATEGY_RULES.SCORE_THRESHOLD,
      tradeSizeUsdt: STRATEGY_RULES.TRADE_SIZE_USDT,
    };

    if (Array.isArray(body.selectedTimeframes)) {
      const clean = body.selectedTimeframes.filter((t: string): t is Timeframe =>
        ALL_TIMEFRAMES.includes(t as Timeframe)
      );
      if (clean.length > 0) {
        update.selectedTimeframes = clean;
      }
    }
    if (body.entryMode === "A" || body.entryMode === "B") {
      update.entryMode = body.entryMode;
    }
    if (
      typeof body.timeframePreset === "string" &&
      ["all", "fast", "balanced", "swing", "custom"].includes(body.timeframePreset)
    ) {
      update.timeframePreset = body.timeframePreset;
    }
    if (typeof body.autoScanEnabled === "boolean") {
      update.autoScanEnabled = body.autoScanEnabled;
    }
    if (body.language === "ar" || body.language === "en") {
      update.language = body.language;
    }
    if (typeof body.soundEnabled === "boolean") {
      update.soundEnabled = body.soundEnabled;
    }
    if (typeof body.browserNotifications === "boolean") {
      update.browserNotifications = body.browserNotifications;
    }

    const [updated] = await db
      .update(settings)
      .set(update)
      .where(eq(settings.id, "default"))
      .returning();

    return NextResponse.json({ settings: updated });
  } catch (err) {
    console.error("[API /settings PATCH] error:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
