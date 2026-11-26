import { NextResponse } from "next/server";
import { stopActiveScanJobs } from "@/lib/scanner";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const res = await stopActiveScanJobs();
    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    console.error("[API /scan/stop] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to stop scan" },
      { status: 500 }
    );
  }
}
