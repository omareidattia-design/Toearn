import {
  checkDbTablesReady,
  getLatestScanJobSummary,
  getOrCreateSettings,
  monitorOpenTrades,
  resumeInterruptedScanIfAny,
  startScanJob,
} from "./scanner";
import { deliverOneTelegramJob } from "./telegram";

const g = globalThis as typeof globalThis & {
  __qannasSchedulerStarted?: boolean;
  __qannasLastAutoScanAt?: number;
};

export function ensureServerSchedulerStarted(): void {
  if (g.__qannasSchedulerStarted) return;
  g.__qannasSchedulerStarted = true;
  g.__qannasLastAutoScanAt = 0;

  // Separate from market scans: delivery retries and leases survive a restart in PostgreSQL.
  const telegramTick = () => {
    void deliverOneTelegramJob().catch(() => console.error("[QANNAS Scheduler] Telegram outbox unavailable"));
  };
  setInterval(telegramTick, 3_500).unref();


  // Startup boot sequence (after a brief delay so DB pool & migrations are ready)
  setTimeout(async () => {
    try {
      const ready = await checkDbTablesReady();
      if (!ready) return;
      await getOrCreateSettings();
      await resumeInterruptedScanIfAny();
      await monitorOpenTrades();
    } catch (err) {
      console.error("[QANNAS Scheduler] Startup check error:", (err as Error).message);
    }
  }, 5_000);

  // Every 60 seconds: monitor open trades, expire old signals, and check 5-min auto-scan trigger
  setInterval(async () => {
    try {
      const ready = await checkDbTablesReady();
      if (!ready) return;

      await monitorOpenTrades();

      const cfg = await getOrCreateSettings();
      if (!cfg.autoScanEnabled) return;

      const intervalMs = Math.max(1, cfg.autoScanIntervalMinutes || 5) * 60 * 1000;
      const latest = await getLatestScanJobSummary();

      // Never overlap a RUNNING scan
      if (latest && latest.status === "RUNNING") return;

      // Respect interval since last finished/started scan (and never immediately restart a job the user just stopped < 5m ago!)
      const lastRefTime = latest
        ? new Date(latest.finishedAt ?? latest.updatedAt ?? latest.startedAt).getTime()
        : g.__qannasLastAutoScanAt || 0;

      if (Date.now() - lastRefTime >= intervalMs) {
        g.__qannasLastAutoScanAt = Date.now();
        console.log("[QANNAS Scheduler] Starting scheduled 5-min AUTO scan...");
        await startScanJob({ trigger: "AUTO" });
      }
    } catch (err) {
      console.error("[QANNAS Scheduler] Tick error:", (err as Error).message);
    }
  }, 60_000);
}
