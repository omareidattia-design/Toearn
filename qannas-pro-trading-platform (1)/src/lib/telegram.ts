import { and, desc, eq, gt, gte, inArray, lte, or, sql } from "drizzle-orm";
import { db, favorites, settings, signals, telegramOutbox, telegramSecrets } from "@/db";
import type { TelegramConfig, TelegramConfigSource, TelegramIssue, TelegramMode, TelegramStatus } from "./telegram-model";
import { STRATEGY_RULES } from "./types";

const LOCK = 73421230;
const SEND_INTERVAL_MS = 3_400; // Stay under Telegram's 20 messages/minute per group.
const LEASE_MS = 30_000;
const TEST_COOLDOWN_MS = 60_000;
const MAX_ATTEMPTS = 6;
const DELIVERY_ISSUES: TelegramIssue[] = ["RATE_LIMITED", "UNAVAILABLE", "BAD_TOKEN", "CHAT_ACCESS", "REJECTED"];
const UTC = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "medium", timeStyle: "short" });
const PRICE = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 12, useGrouping: false });
type SavedSignal = typeof signals.$inferSelect;
type OutboxJob = typeof telegramOutbox.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Credentials = { token: string; chatId: string | number };

const TOKEN_PATTERN = /^\d{3,20}:[A-Za-z0-9_-]{20,100}$/;
const NUMERIC_CHAT_PATTERN = /^-?[1-9]\d{0,15}$/;
const NAMED_CHAT_PATTERN = /^@[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

function maskChat(chat: string): string {
  if (chat.startsWith("@")) return chat.length <= 5 ? "•••" : `${chat.slice(0, 4)}•••${chat.slice(-2)}`;
  return chat.length <= 4 ? "•••" : `${chat.slice(0, 3)}•••${chat.slice(-3)}`;
}

/** Credentials entered in the workspace UI win; server environment variables remain a fallback. */
async function configuration(): Promise<{ state: TelegramConfig; source: TelegramConfigSource; chatMasked: string | null; credentials: Credentials | null }> {
  let token = "";
  let input = "";
  let source: TelegramConfigSource = null;
  try {
    const [row] = await db.select().from(telegramSecrets).where(eq(telegramSecrets.id, "default")).limit(1);
    token = row?.botToken.trim() ?? "";
    input = row?.chatId.trim() ?? "";
    if (token && input) source = "UI";
  } catch {
    // Configuration status stays honest if the settings table is unavailable.
  }
  if (!token || !input) {
    token = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
    input = process.env.TELEGRAM_CHAT_ID?.trim() ?? "";
    if (token && input) source = "ENV";
  }
  if (!token || !input) return { state: "MISSING", source, chatMasked: null, credentials: null };
  const numericChat = NUMERIC_CHAT_PATTERN.test(input) && Number.isSafeInteger(Number(input));
  const namedChat = NAMED_CHAT_PATTERN.test(input);
  if (!TOKEN_PATTERN.test(token) || (!numericChat && !namedChat)) {
    return { state: "INVALID", source, chatMasked: maskChat(input), credentials: null };
  }
  return { state: "CONFIGURED", source, chatMasked: maskChat(input), credentials: { token, chatId: numericChat ? Number(input) : input } };
}

/** Persists bot credentials for server-side delivery. The token is never returned to a client. */
export async function saveTelegramConfig(rawToken: string, rawChatId: string) {
  const token = rawToken.trim();
  const chatId = rawChatId.trim();
  if (!TOKEN_PATTERN.test(token)) return { outcome: "INVALID_TOKEN" as const };
  if (!NUMERIC_CHAT_PATTERN.test(chatId) && !NAMED_CHAT_PATTERN.test(chatId)) return { outcome: "INVALID_CHAT" as const };
  await db.insert(telegramSecrets).values({ id: "default", botToken: token, chatId })
    .onConflictDoUpdate({ target: telegramSecrets.id, set: { botToken: token, chatId, updatedAt: new Date() } });
  return { outcome: "SAVED" as const };
}

export async function clearTelegramConfig() {
  await db.delete(telegramSecrets).where(eq(telegramSecrets.id, "default"));
}

function setupCanBeSent(signal: SavedSignal, now = new Date()) {
  const { entryPrice, stopLoss, tp1, tp2, tp3, tradeSizeUsdt, score, reasons, expiresAt, status, exchange, analysisSnapshot } = signal;
  if (status !== "ACTIVE" || expiresAt <= now || (exchange !== "BINANCE" && exchange !== "MEXC") || analysisSnapshot.qualified !== true || !reasons.length || score < STRATEGY_RULES.SCORE_THRESHOLD || tradeSizeUsdt !== STRATEGY_RULES.TRADE_SIZE_USDT) return false;
  if (![entryPrice, stopLoss, tp1, tp2, tp3].every(Number.isFinite) || !(0 < stopLoss && stopLoss < entryPrice && entryPrice < tp1 && tp1 < tp2 && tp2 < tp3)) return false;
  const tp1Gross = ((tp1 - entryPrice) / entryPrice) * 100;
  const netTp2 = ((tp2 - entryPrice) / entryPrice) * 100 - STRATEGY_RULES.TOTAL_COST_PCT;
  return tp1Gross >= STRATEGY_RULES.MIN_PROFIT_PCT && netTp2 >= STRATEGY_RULES.MIN_PROFIT_PCT;
}

async function isFavorite(tx: Transaction | typeof db, signal: SavedSignal) {
  const [row] = await tx.select({ id: favorites.id }).from(favorites)
    .where(and(eq(favorites.symbol, signal.symbol), eq(favorites.exchange, signal.exchange))).limit(1);
  return Boolean(row);
}

/** Called in the transaction that saves the real, qualified scan signal. This only queues, never waits on Telegram. */
export async function queueAutomaticTelegramSignal(tx: Transaction, signal: SavedSignal) {
  if (!(await configuration()).credentials || !setupCanBeSent(signal)) return;
  const [cfg] = await tx.select({ mode: settings.telegramMode }).from(settings).where(eq(settings.id, "default")).limit(1);
  if (cfg?.mode === "OFF" || (cfg?.mode === "FAVORITES" && !await isFavorite(tx, signal))) return;
  await tx.insert(telegramOutbox).values({ kind: "SIGNAL", signalId: signal.id, expiresAt: signal.expiresAt }).onConflictDoNothing({ target: telegramOutbox.signalId });
}

export async function saveTelegramMode(mode: TelegramMode) {
  await db.insert(settings).values({ id: "default", telegramMode: mode }).onConflictDoUpdate({ target: settings.id, set: { telegramMode: mode, updatedAt: new Date() } });
}

export async function queueTelegramTest() {
  if (!(await configuration()).credentials) return { outcome: "MISSING_CONFIGURATION" as const };
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK})`);
    const now = new Date();
    const [recent] = await tx.select({ createdAt: telegramOutbox.createdAt }).from(telegramOutbox)
      .where(eq(telegramOutbox.kind, "TEST")).orderBy(desc(telegramOutbox.createdAt)).limit(1);
    if (recent && now.getTime() - recent.createdAt.getTime() < TEST_COOLDOWN_MS) return { outcome: "COOLDOWN" as const };
    const [job] = await tx.insert(telegramOutbox).values({ kind: "TEST", expiresAt: new Date(now.getTime() + 180_000) }).returning({ id: telegramOutbox.id });
    return { outcome: "QUEUED" as const, id: job.id };
  });
}

export async function getTelegramStatus(): Promise<TelegramStatus> {
  const q = telegramOutbox;
  const now = new Date();
  const [[cfg], [stats], [latestTest], [latestIssue]] = await Promise.all([
    db.select({ mode: settings.telegramMode }).from(settings).where(eq(settings.id, "default")).limit(1),
    db.select({
      pending: sql<number>`(count(*) filter (where ${q.status} in ('QUEUED', 'SENDING') and ${q.expiresAt} > ${now.toISOString()}::timestamptz))::int`,
      sent: sql<number>`(count(*) filter (where ${q.status} = 'SENT' and ${q.kind} = 'SIGNAL'))::int`,
      lastSent: sql<string | null>`max(${q.sentAt})::text`,
    }).from(q),
    db.select({ status: q.status, createdAt: q.createdAt, error: q.errorCode }).from(q).where(eq(q.kind, "TEST")).orderBy(desc(q.createdAt)).limit(1),
    db.select({ issue: q.errorCode, at: q.updatedAt }).from(q).where(inArray(q.errorCode, DELIVERY_ISSUES)).orderBy(desc(q.updatedAt)).limit(1),
  ]);
  const cfgState = await configuration();
  const lastSentAt = stats.lastSent ? new Date(stats.lastSent).toISOString() : null;
  return {
    config: cfgState.state, source: cfgState.source, chatMasked: cfgState.chatMasked, mode: cfg?.mode ?? "ALL",
    pendingCount: stats.pending, sentCount: stats.sent, lastSentAt,
    lastIssue: latestIssue && (!lastSentAt || latestIssue.at.getTime() > Date.parse(lastSentAt)) ? latestIssue.issue : null,
    lastTest: latestTest ? { ...latestTest, createdAt: latestTest.createdAt.toISOString() } : null,
  };
}

function messageForSignal(s: SavedSignal, ar: boolean) {
  const change = (p: number) => {
    const pct = ((p - s.entryPrice) / s.entryPrice) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
  };
  const net = (STRATEGY_RULES.TRADE_SIZE_USDT / s.entryPrice) * (s.tp2 - s.entryPrice) - STRATEGY_RULES.TRADE_SIZE_USDT * STRATEGY_RULES.TOTAL_COST_PCT / 100;
  const tfs = s.qualifiedTimeframes.length ? s.qualifiedTimeframes.join(" · ") : s.primaryTimeframe;
  return [
    `🎯 QANNAS PRO · ${ar ? "فرصة شراء Spot" : "Spot buy setup"}`,
    `${s.symbol} · ${s.exchange} Spot`,
    `${ar ? "الفريم" : "Timeframe"}: ${s.primaryTimeframe} | ${ar ? "الفريمات المؤهلة" : "Qualified frames"}: ${tfs}`,
    `${ar ? "قوة الإعداد" : "Setup strength"}: ${s.score}/100 (${s.grade})`,
    "",
    `${ar ? "الدخول" : "Entry"}: ${PRICE.format(s.entryPrice)} USDT`,
    `SL: ${PRICE.format(s.stopLoss)} (${change(s.stopLoss)})`,
    `TP1: ${PRICE.format(s.tp1)} (${change(s.tp1)})`,
    `TP2: ${PRICE.format(s.tp2)} (${change(s.tp2)})`,
    `TP3: ${PRICE.format(s.tp3)} (${change(s.tp3)})`,
    `${ar ? "حجم التتبّع" : "Tracking size"}: 100 USDT · ${ar ? "الصافي المقدَّر عند TP2" : "Estimated net at TP2"}: +${net.toFixed(2)} USDT`,
    "",
    ar ? "سبب التأهل:" : "Why it qualified:",
    ...s.reasons.slice(0, 10).map((r) => `• ${(ar ? r.labelAr : r.labelEn).slice(0, 180)}`),
    `${ar ? "تنتهي الصلاحية" : "Expires"}: ${UTC.format(s.expiresAt)} UTC`,
    ar ? "للتتبّع فقط؛ لا تنفيذ أوامر. الدرجة ليست احتمال ربح." : "Tracking only; no order execution. Score is not a probability of profit.",
  ].join("\n");
}

class DeliveryError extends Error {
  constructor(readonly code: TelegramIssue, readonly retryable: boolean, readonly retryAfterMs = 0) { super(code); }
}

async function sendMessage({ token, chatId }: Credentials, text: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(9_000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
    });
  } catch {
    // Never log an exception with the request URL: it contains the server-only bot token.
    throw new DeliveryError("UNAVAILABLE", true);
  }
  const data = await response.json().catch(() => null) as { ok?: boolean; error_code?: number; result?: { message_id?: number }; parameters?: { retry_after?: number } } | null;
  if (response.ok && data?.ok === true && typeof data.result?.message_id === "number") return String(data.result.message_id);
  const code = data?.error_code ?? response.status;
  if (code === 429) throw new DeliveryError("RATE_LIMITED", true, Math.max(SEND_INTERVAL_MS, Number(data?.parameters?.retry_after ?? 5) * 1_000 + 500));
  if (code === 401 || code === 404) throw new DeliveryError("BAD_TOKEN", false);
  if (code === 400 || code === 403) throw new DeliveryError("CHAT_ACCESS", false);
  if (code >= 500 || !data || code === 200) throw new DeliveryError("UNAVAILABLE", true);
  throw new DeliveryError("REJECTED", false);
}

async function claimDelivery() {
  const q = telegramOutbox;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK})`);
    const now = new Date();
    const leaseEnded = and(eq(q.status, "SENDING"), lte(q.leaseUntil, now));
    await tx.update(q).set({ status: "SKIPPED", leaseUntil: null, errorCode: "EXPIRED", updatedAt: now })
      .where(and(lte(q.expiresAt, now), or(eq(q.status, "QUEUED"), leaseEnded)));
    await tx.update(q).set({ status: "FAILED", leaseUntil: null, errorCode: "UNAVAILABLE", updatedAt: now })
      .where(and(leaseEnded, gte(q.attempts, MAX_ATTEMPTS)));
    await tx.update(q).set({ status: "QUEUED", leaseUntil: null, updatedAt: now }).where(leaseEnded);
    const [blocked] = await tx.select({ id: q.id }).from(q).where(or(
      eq(q.status, "SENDING"), gte(q.lastAttemptAt, new Date(now.getTime() - SEND_INTERVAL_MS)),
      and(eq(q.status, "QUEUED"), eq(q.errorCode, "RATE_LIMITED"), gt(q.nextAttemptAt, now)),
    )).limit(1);
    if (blocked) return null;
    const [cfg] = await tx.select({ mode: settings.telegramMode, lang: settings.language }).from(settings).where(eq(settings.id, "default")).limit(1);
    const [candidate] = await tx.select().from(q).where(and(eq(q.status, "QUEUED"), lte(q.nextAttemptAt, now), cfg?.mode === "OFF" ? eq(q.kind, "TEST") : undefined))
      .orderBy(sql`case when ${q.kind} = 'TEST' then 0 else 1 end`, q.id).limit(1);
    if (!candidate) return null;
    const [job] = await tx.update(q).set({ status: "SENDING", attempts: candidate.attempts + 1, lastAttemptAt: now, leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now }).where(eq(q.id, candidate.id)).returning();
    return { job, mode: cfg?.mode ?? "ALL", ar: cfg?.lang !== "en" };
  });
}

async function finishDelivery(job: OutboxJob, values: Partial<typeof telegramOutbox.$inferInsert>) {
  await db.update(telegramOutbox).set({ ...values, leaseUntil: null, updatedAt: new Date() })
    .where(and(eq(telegramOutbox.id, job.id), eq(telegramOutbox.status, "SENDING"), eq(telegramOutbox.attempts, job.attempts)));
}

const worker = globalThis as typeof globalThis & { __qannasTelegramSending?: boolean };

export async function deliverOneTelegramJob(): Promise<void> {
  const { credentials } = await configuration();
  if (!credentials || worker.__qannasTelegramSending) return;
  worker.__qannasTelegramSending = true;
  try {
    const claimed = await claimDelivery();
    if (!claimed) return;
    const { job, mode, ar } = claimed;
    if (job.expiresAt.getTime() <= Date.now()) {
      await finishDelivery(job, { status: "SKIPPED", errorCode: "EXPIRED" });
      return;
    }
    let text: string;
    if (job.kind === "TEST") {
      text = ar ? "QANNAS PRO · ✅ تم اختبار اتصال تليجرام. هذه رسالة اختبار وليست إشارة تداول." : "QANNAS PRO · ✅ Telegram delivery test. This is a test message, not a trade setup.";
    } else {
      const [signal] = await db.select().from(signals).where(eq(signals.id, job.signalId ?? -1)).limit(1);
      if (!signal || !setupCanBeSent(signal)) {
        await finishDelivery(job, { status: "SKIPPED", errorCode: "INACTIVE" });
        return;
      }
      if (mode === "FAVORITES" && !await isFavorite(db, signal)) {
        await finishDelivery(job, { status: "SKIPPED", errorCode: "FILTERED" });
        return;
      }
      text = messageForSignal(signal, ar);
    }
    let telegramMessageId: string;
    try {
      telegramMessageId = await sendMessage(credentials, text);
    } catch (cause) {
      const error = cause instanceof DeliveryError ? cause : new DeliveryError("UNAVAILABLE", true);
      const delay = Math.max(error.retryAfterMs, Math.min(300_000, 6_000 * 2 ** (job.attempts - 1)));
      const nextAttemptAt = new Date(Date.now() + delay);
      const retry = error.retryable && job.attempts < MAX_ATTEMPTS && nextAttemptAt < job.expiresAt;
      await finishDelivery(job, { status: retry ? "QUEUED" : "FAILED", errorCode: error.code, nextAttemptAt });
      return;
    }
    await finishDelivery(job, { status: "SENT", sentAt: new Date(), errorCode: null, telegramMessageId });
  } finally {
    worker.__qannasTelegramSending = false;
  }
}
