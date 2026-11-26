import { NextResponse } from "next/server";
import { getLatestScanJobSummary, getRecentScanJobs } from "@/lib/scanner";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [latest, history] = await Promise.all([
      getLatestScanJobSummary(),
      getRecentScanJobs(10),
    ]);
    return NextResponse.json({ latest, history });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
