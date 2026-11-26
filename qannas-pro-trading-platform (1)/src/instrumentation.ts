export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureServerSchedulerStarted } = await import("./lib/scheduler");
    ensureServerSchedulerStarted();
  }
}
