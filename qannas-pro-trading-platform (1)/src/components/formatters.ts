import { Language } from "@/lib/types";

export function fmtPrice(p: number | null | undefined): string {
  if (p == null || !Number.isFinite(p) || p === 0) return "—";
  if (p >= 1000) return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (p >= 10) return p.toFixed(3);
  if (p >= 1) return p.toFixed(4);
  if (p >= 0.01) return p.toFixed(5);
  if (p >= 0.0001) return p.toFixed(7);
  return p.toFixed(9);
}

export function fmtPct(v: number | null | undefined, showPlus = true): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 && showPlus ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

export function fmtUsdt(v: number | null | undefined, showPlus = false): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 && showPlus ? "+" : "";
  return `${sign}$${v.toFixed(2)}`;
}

export function fmtVol(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function fmtDateTime(iso: string | Date | null | undefined, lang: Language = "ar"): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(lang === "ar" ? "ar-EG" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTimeRemaining(expiresAt: string | Date, lang: Language = "ar"): string {
  const exp = typeof expiresAt === "string" ? new Date(expiresAt).getTime() : expiresAt.getTime();
  const diffMin = Math.max(0, Math.round((exp - Date.now()) / 60_000));
  if (diffMin === 0) return lang === "ar" ? "منتهية" : "Expired";
  return lang === "ar" ? `تنتهي خلال ${diffMin} د` : `Expires in ${diffMin}m`;
}

export function playAlertChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch {
    // Ignore autoplay restrictions
  }
}
