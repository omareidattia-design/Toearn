"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, CheckCircle2, ChevronDown, Clock3, Eye, EyeOff, KeyRound, Radio, Save, Send, Trash2 } from "lucide-react";
import { TELEGRAM_MODES, type TelegramIssue, type TelegramMode, type TelegramStatus } from "@/lib/telegram-model";
import type { Language } from "@/lib/types";
import { fmtDateTime } from "./formatters";

const issueCopy: Record<TelegramIssue, [string, string]> = {
  BAD_TOKEN: ["تليجرام لم يقبل توكن البوت. راجع القيمة المدخلة.", "Telegram rejected the bot token. Check the entered value."],
  CHAT_ACCESS: ["تليجرام لم يسمح بالإرسال للمحادثة. راجع معرّفها وصلاحية البوت.", "Telegram refused access to the destination. Check the chat ID and bot permissions."],
  RATE_LIMITED: ["تليجرام طلب إبطاء الإرسال. المحاولة التالية مؤجلة تلقائيًا.", "Telegram rate-limited delivery. Retries are automatically delayed."],
  UNAVAILABLE: ["تعذّر الاتصال بتليجرام مؤقتًا.", "Telegram is temporarily unavailable."],
  REJECTED: ["تليجرام رفض الطلب. جرّب رسالة اختبار بعد مراجعة الإعداد.", "Telegram rejected the request. Review setup and try a test."],
  EXPIRED: ["انتهت صلاحية الرسالة قبل إرسالها.", "The message expired before delivery."],
  INACTIVE: ["الإشارة لم تعد نشطة.", "The setup is no longer active."],
  FILTERED: ["الإشارة لا تطابق وضع الإرسال الحالي.", "The setup does not match the current delivery mode."],
};
const modeCopy: Record<TelegramMode, [string, string]> = {
  ALL: ["كل الصفقات المؤهلة", "All qualifying setups"],
  FAVORITES: ["المفضلة فقط", "Favorites only"],
  OFF: ["إيقاف التلقائي", "Pause automatic delivery"],
};

const TOKEN_RE = /^\d{3,20}:[A-Za-z0-9_-]{20,100}$/;
const CHAT_RE = /^(-?[1-9]\d{0,15}|@[a-zA-Z][a-zA-Z0-9_]{3,31})$/;

export default function TelegramSettingsPanel({ lang }: { lang: Language }) {
  const ar = lang === "ar";
  const pick = (copy: [string, string]) => copy[ar ? 0 : 1];
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);

  // Credential form: values live only in this component and go straight to the server POST.
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [revealToken, setRevealToken] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/telegram", { cache: "no-store", signal });
      if (!res.ok) throw new Error("UNAVAILABLE");
      const next: TelegramStatus = await res.json();
      if (signal?.aborted) return;
      setStatus(next);
      setUnavailable(false);
    } catch {
      if (!signal?.aborted) setUnavailable(true);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => { if (!document.hidden) void load(controller.signal); }, 4_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [load]);

  async function post(body: Record<string, unknown>): Promise<{ ok: boolean; code?: string; fresh?: TelegramStatus }> {
    const res = await fetch("/api/telegram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, code: String(result.error ?? "UNAVAILABLE") };
    const fresh = result.status as TelegramStatus | undefined;
    if (fresh) setStatus(fresh);
    return { ok: true, fresh };
  }

  async function apply(change: { action: "mode"; mode: TelegramMode } | { action: "test" }) {
    setBusy(true);
    setFeedback(null);
    try {
      const { ok, code } = await post(change);
      if (!ok) throw new Error(code ?? "UNAVAILABLE");
      if (change.action === "mode") setFeedback({ error: false, text: ar ? "تم حفظ وضع الإرسال على الخادم." : "Delivery mode saved on the server." });
      await load();
    } catch (err) {
      const code = err instanceof Error ? err.message : "UNAVAILABLE";
      setFeedback({ error: true, text: code === "COOLDOWN" ? (ar ? "تقدر تطلب رسالة اختبار واحدة كل دقيقة." : "You can request one test per minute.") : code === "MISSING_CONFIGURATION" ? (ar ? "تليجرام غير مهيّأ على الخادم." : "Telegram is not configured on the server.") : (ar ? "تعذّر حفظ الطلب أو إضافته للطابور." : "The request could not be saved or queued.") });
    } finally { setBusy(false); }
  }

  async function saveCredentials(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!TOKEN_RE.test(botToken.trim())) {
      setFormError(ar ? "صيغة التوكن غير صحيحة — الصيغة: 123456789:AA... من BotFather." : "Invalid token format — expected 123456789:AA… from BotFather.");
      return;
    }
    if (!CHAT_RE.test(chatId.trim())) {
      setFormError(ar ? "أدخل معرّف محادثة صحيحًا: رقم (يمكن يكون سالبًا مثل ‎-1001234567890) أو معرّف قناة عام مثل ‎@channelname." : "Enter a valid chat destination: a numeric ID (may be negative, e.g. -1001234567890) or a public channel such as @channelname.");
      return;
    }
    setBusy(true);
    try {
      const { ok, code } = await post({ action: "save_config", token: botToken.trim(), chatId: chatId.trim() });
      if (!ok) {
        setFormError(code === "INVALID_TOKEN" ? (ar ? "الخادم رفض صيغة التوكن." : "The server rejected the token format.") : code === "INVALID_CHAT" ? (ar ? "الخادم رفض معرّف المحادثة." : "The server rejected the chat ID.") : (ar ? "تعذّر حفظ الإعداد على الخادم." : "Could not save the configuration on the server."));
        return;
      }
      // Never keep the raw token in the DOM after a successful save.
      setBotToken("");
      setChatId("");
      setRevealToken(false);
      setFeedback({ error: false, text: ar ? "تم حفظ إعداد البوت على الخادم — التوكن لا يُعرض ولا يُرسل للمتصفح بعد الحفظ." : "Bot credentials saved on the server — the token is never returned to the browser." });
      await load();
    } catch {
      setFormError(ar ? "تعذّر الوصول إلى الخادم لحفظ الإعداد." : "Could not reach the server to save the configuration.");
    } finally { setBusy(false); }
  }

  async function clearCredentials() {
    setBusy(true);
    setFormError(null);
    try {
      const { ok, fresh } = await post({ action: "clear_config" });
      if (!ok) throw new Error();
      setBotToken("");
      setChatId("");
      await load();
      setFeedback({
        error: false,
        text: fresh?.source === "ENV"
          ? (ar ? "تم مسح ما هو محفوظ داخل المنصة، وما يزال الإعداد مفعّلًا من متغيرات البيئة على الخادم." : "Saved workspace credentials cleared; server environment variables still apply.")
          : (ar ? "تم مسح إعداد البوت من الخادم." : "Bot credentials cleared from the server."),
      });
    } catch {
      setFormError(ar ? "تعذّر مسح الإعداد." : "Could not clear the configuration.");
    } finally { setBusy(false); }
  }

  const configured = status?.config === "CONFIGURED";
  const savedInDb = status?.source === "UI";
  const lastTest = status?.lastTest;
  const testInProgress = lastTest?.status === "QUEUED" || lastTest?.status === "SENDING";
  const stateLabel = unavailable ? (ar ? "الحالة غير متاحة" : "Status unavailable") : !status ? (ar ? "جاري قراءة الحالة" : "Checking status") : status.config === "MISSING" ? (ar ? "غير مهيّأ" : "Not configured") : status.config === "INVALID" ? (ar ? "إعداد غير صالح" : "Invalid configuration") : status.lastIssue ? (ar ? "الإرسال يحتاج مراجعة" : "Delivery needs attention") : status.mode === "OFF" ? (ar ? "الإرسال التلقائي متوقف" : "Automatic delivery paused") : status.lastSentAt ? (ar ? "تم التحقق من الإرسال" : "Delivery verified") : (ar ? "مهيّأ · في انتظار أول إرسال" : "Configured · awaiting first delivery");

  return (
    <section className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 sm:p-5 space-y-4" aria-labelledby="telegram-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/10 text-[#D4AF37] p-2.5"><Send size={19} /></div>
          <div>
            <h3 id="telegram-title" className="font-extrabold text-[#F8FAFC] text-sm sm:text-base">{ar ? "إرسال الصفقات إلى تليجرام" : "Telegram trade delivery"}</h3>
            <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">{ar ? "الخادم يرسل فرص الشراء الجديدة بعد التأهل تلقائيًا، حتى لو الصفحة مقفولة. كل رسالة فيها الفريم، سبب الإشارة، الدخول، الوقف والأهداف." : "The server sends newly qualified buys even when this page is closed. Each message includes the timeframe, reasons, entry, stop and targets."}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-[#D4AF37]/25 bg-[#0A0F1C] text-[11px] text-[#E5C158] font-bold"><Radio size={12} />{stateLabel}</span>
      </div>

      {/* Bot credentials form: written straight to the server, never echoed back. */}
      <form onSubmit={saveCredentials} className="rounded-xl border border-[#1A2338] bg-[#070B14] p-3.5 space-y-3" aria-label={ar ? "إعداد بوت تليجرام" : "Telegram bot credentials"}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-bold text-[#E5C158]">
            <KeyRound size={14} />
            <span>{ar ? "بيانات البوت للمحادثة" : "Bot credentials"}</span>
          </div>
          {status && (
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className={`px-2 py-0.5 rounded border ${configured ? "border-[#10B981]/40 bg-[#10B981]/10 text-[#10B981]" : "border-[#1E293B] bg-[#121A2D] text-[#94A3B8]"}`}>
                {configured ? (ar ? "مهيّأ" : "Configured") : status.config === "INVALID" ? (ar ? "قيمة غير صالحة" : "Invalid value") : (ar ? "غير مهيّأ" : "Not configured")}
              </span>
              <span className="text-[#94A3B8]">
                {status.source === "UI" ? (ar ? "المصدر: محفوظ داخل المنصة" : "Source: saved in workspace") : status.source === "ENV" ? (ar ? "المصدر: إعدادات الخادم (متغيرات البيئة)" : "Source: server environment") : (ar ? "المصدر: لا يوجد" : "Source: none")}
              </span>
              {status.chatMasked && <span className="font-num text-[#CBD5E1]" dir="ltr">{status.chatMasked}</span>}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2.5 items-end">
          <label className="space-y-1 min-w-0">
            <span className="block text-[11px] text-[#94A3B8]">{ar ? "توكن البوت (Bot Token)" : "Bot token"}</span>
            <span className="relative block">
              <input
                type={revealToken ? "text" : "password"}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                placeholder="123456789:AA..."
                aria-label={ar ? "توكن البوت" : "Bot token"}
                className="w-full rounded-lg bg-[#0D1322] border border-[#1E293B] ps-9 pe-3 py-2 text-xs font-num text-[#F8FAFC] placeholder:text-[#475569] focus:outline-none focus:border-[#D4AF37]"
              />
              <button
                type="button"
                onClick={() => setRevealToken((v) => !v)}
                aria-label={revealToken ? (ar ? "إخفاء التوكن" : "Hide token") : (ar ? "إظهار التوكن" : "Show token")}
                className="absolute inset-y-0 start-0 w-9 grid place-items-center text-[#64748B] hover:text-[#D4AF37] cursor-pointer"
              >
                {revealToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </span>
          </label>

          <label className="space-y-1 min-w-0">
            <span className="block text-[11px] text-[#94A3B8]">{ar ? "معرّف المحادثة أو القناة (Chat ID)" : "Chat ID or channel"}</span>
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              placeholder="-1001234567890"
              aria-label={ar ? "معرّف المحادثة" : "Chat ID"}
              className="w-full rounded-lg bg-[#0D1322] border border-[#1E293B] px-3 py-2 text-xs font-num text-[#F8FAFC] placeholder:text-[#475569] focus:outline-none focus:border-[#D4AF37]"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || unavailable || !botToken.trim() || !chatId.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#D4AF37] hover:bg-[#E5C158] px-3.5 py-2 text-xs text-[#070B14] font-extrabold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Save size={14} />
              {ar ? "حفظ الإعداد" : "Save"}
            </button>
            <button
              type="button"
              onClick={clearCredentials}
              disabled={busy || unavailable || !savedInDb}
              title={ar ? "مسح البيانات المحفوظة داخل المنصة" : "Clear saved workspace credentials"}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] bg-[#0D1322] hover:border-[#EF4444]/60 hover:text-[#EF4444] px-3 py-2 text-xs text-[#94A3B8] font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 size={14} />
              {ar ? "مسح" : "Clear"}
            </button>
          </div>
        </div>

        {formError && <p className="text-[11px] text-[#E5C158]" role="alert">{formError}</p>}
        <p className="text-[11px] text-[#64748B] leading-relaxed">
          {ar
            ? "التوكن يُحفظ في قاعدة بيانات الخادم ولا يُرسل إلى المتصفح ولا يظهر مرة أخرى بعد الحفظ. القيم الحالية مفعّلة للخادم بمفرده حتى والصفحة مقفولة."
            : "The token is stored in the server database, never sent to the browser, and never displayed again after saving. Current values apply server-side even when this page is closed."}
        </p>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-4 border-t border-[#1A2338] pt-3.5">
        <div className="space-y-2">
          <span className="text-xs text-[#CBD5E1] font-bold">{ar ? "اختار إيه اللي يتبعت تلقائيًا" : "Automatic delivery scope"}</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={ar ? "وضع إرسال تليجرام" : "Telegram delivery mode"}>
            {TELEGRAM_MODES.map((mode) => <button key={mode} type="button" disabled={!status || busy || unavailable} aria-pressed={status?.mode === mode} onClick={() => { if (status?.mode !== mode) void apply({ action: "mode", mode }); }} className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${status?.mode === mode ? "border-[#D4AF37]/55 bg-[#D4AF37]/12 text-[#E5C158]" : "border-[#1E293B] bg-[#070B14] text-[#94A3B8] hover:text-[#F8FAFC]"}`}>{pick(modeCopy[mode])}</button>)}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 items-start lg:items-end lg:justify-end">
          <button type="button" disabled={!configured || unavailable || busy || testInProgress} onClick={() => void apply({ action: "test" })} className="inline-flex gap-2 items-center rounded-lg bg-[#D4AF37] hover:bg-[#E5C158] px-3.5 py-2 text-xs text-[#070B14] font-extrabold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"><Send size={14} />{testInProgress ? (ar ? "الاختبار في الطابور…" : "Test queued…") : (ar ? "إرسال رسالة اختبار" : "Send test message")}</button>
          {status && <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8]"><Clock3 size={12} />{ar ? "في الانتظار:" : "Queued:"} <b className="font-num text-[#CBD5E1]">{status.pendingCount}</b> · {ar ? "صفقات مرسلة:" : "Setups sent:"} <b className="font-num text-[#CBD5E1]">{status.sentCount}</b></div>}
        </div>
      </div>
      {lastTest && !testInProgress && <div className={`rounded-lg border border-[#1A2338] bg-[#070B14] px-3 py-2 text-[11px] flex items-center gap-2 ${lastTest.status === "SENT" ? "text-[#D1D5DB]" : "text-[#E5C158]"}`}>
        {lastTest.status === "SENT" && <CheckCircle2 size={14} />}
        {lastTest.status === "SENT" ? (ar ? "تليجرام أكّد استلام رسالة الاختبار." : "Telegram confirmed receipt of the test message.") : lastTest.error ? pick(issueCopy[lastTest.error]) : (ar ? "لم تُرسل رسالة الاختبار." : "Test message not delivered.")} <span dir="ltr" className="text-[#94A3B8]">{fmtDateTime(lastTest.createdAt, lang)}</span>
      </div>}
      {status?.lastIssue && lastTest?.error !== status.lastIssue && <p className="text-[11px] text-[#E5C158]" role="status">{pick(issueCopy[status.lastIssue])}</p>}
      {feedback && <p className={`text-[11px] ${feedback.error ? "text-[#E5C158]" : "text-[#CBD5E1]"}`} role="status">{feedback.text}</p>}
      <details className="group rounded-lg border border-[#1A2338] bg-[#070B14] px-3 py-2.5">
        <summary className="cursor-pointer list-none flex items-center gap-2 text-xs font-semibold text-[#E5C158]"><ChevronDown size={14} className="group-open:rotate-180" />{ar ? "طريقة ربط البوت بالمحادثة" : "Connect a bot and destination"}</summary>
        <div className="pt-2 text-xs text-[#94A3B8] leading-relaxed space-y-1.5">
          <p>{ar ? "أنشئ البوت من" : "Create a bot with"} <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-num text-[#E5C158]" dir="ltr">@BotFather <ArrowUpRight size={12} /></a>{ar ? "، ثم افتح محادثة معه واضغط Start، أو أضفه للقناة بصلاحية النشر، وخذ معرّف المحادثة." : ", then start a direct chat or add it to the channel with posting permission, and take the chat ID."}</p>
          <p>{ar ? "بديلًا للإدخال هنا: احفظ الإعدادات على الخادم كمتغيرات بيئة ثم أعد تشغيله:" : "Alternatively, save these server environment variables and restart the process:"} <code dir="ltr" className="text-[#E5C158] break-all">TELEGRAM_BOT_TOKEN</code> · <code dir="ltr" className="text-[#E5C158] break-all">TELEGRAM_CHAT_ID</code>{ar ? " (الإدخال من النموذج أعلاه له أولوية)." : " (values entered above take priority)."}</p>
          <p>{ar ? "التوكن خاص بتليجرام فقط ولا يُعرض في المنصة بعد الحفظ. الإرسال التلقائي يبدأ مع الإشارات الجديدة، ولا يرسل إشارات منتهية أو أوامر تداول." : "This is a Telegram-only token and is never shown after saving. Automatic delivery starts with new setups and never sends expired signals or trading orders."}</p>
        </div>
      </details>
    </section>
  );
}
