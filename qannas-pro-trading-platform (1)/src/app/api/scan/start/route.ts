import { NextRequest, NextResponse } from "next/server";
import { startScanJob } from "@/lib/scanner";
import { ALL_TIMEFRAMES, Timeframe } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawTfs = Array.isArray(body.timeframes) ? body.timeframes : undefined;
    const timeframes = rawTfs
      ? rawTfs.filter((t: string): t is Timeframe =>
          ALL_TIMEFRAMES.includes(t as Timeframe)
        )
      : undefined;

    const exchangeFilter =
      body.exchangeFilter === "BINANCE" || body.exchangeFilter === "MEXC"
        ? body.exchangeFilter
        : "ALL";

    const { job, alreadyRunning } = await startScanJob({
      trigger: "MANUAL",
      timeframes,
      exchangeFilter,
    });

    return NextResponse.json({
      ok: true,
      alreadyRunning,
      job: {
        id: job.id,
        status: job.status,
        trigger: job.trigger,
        timeframes: job.timeframes,
        exchangeFilter: job.exchangeFilter,
        discoveredCount: job.discoveredCount,
        binanceDiscovered: job.binanceDiscovered,
        mexcDiscovered: job.mexcDiscovered,
        scannedCount: job.scannedCount,
        qualifiedCount: job.qualifiedCount,
        failedCount: job.failedCount,
        excludedCount: job.excludedCount,
        startedAt: job.startedAt,
      },
    });
  } catch (err) {
    console.error("[API /scan/start] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to start scan" },
      { status: 500 }
    );
  }
}
