"use client";

import React from "react";
import { ShieldCheck, Target, AlertTriangle, Layers } from "lucide-react";
import { Language, STRATEGY_RULES } from "@/lib/types";

interface StrategyPanelProps {
  lang: Language;
  compact?: boolean;
  selectedTimeframes: string[];
  entryMode: "A" | "B";
  onChangeEntryMode?: (mode: "A" | "B") => void;
}

const CONDITIONS = [
  {
    num: 1,
    weight: STRATEGY_RULES.WEIGHTS.HTF_BIAS,
    ar: "انحياز الفريم الأعلى ودعم القاع (اليومي 1d + 4 ساعات)",
    en: "Bullish HTF Bias & Bottom Support (1d + 4h)",
    ruleAr: "هيكل صاعد أو تماسك قاع على 1d و4h (قاع أعلى / استعادة EMA20)",
    ruleEn: "Bullish 1d/4h structure or bottom stabilization (higher low / EMA20 reclaim)",
  },
  {
    num: 2,
    weight: STRATEGY_RULES.WEIGHTS.LIQUIDITY_SWEEP,
    ar: "كنس سيولة البيع عند القاع (SSL Sweep أو Inducement)",
    en: "Sell-side Liquidity Sweep (SSL / Bottom Inducement)",
    ruleAr: "آخر 30 شمعة مقابل أي قاع سابق — كنس البيع هو المعتمد منفصلًا عن كنس الشراء",
    ruleEn: "Last 30 candles vs any prior swing low — SSL tracked separately from BSL",
  },
  {
    num: 3,
    weight: STRATEGY_RULES.WEIGHTS.STRUCTURE_SHIFT,
    ar: "كسر البنية الصاعد بعد القاع (CHoCH / MSS / BOS)",
    en: "Bullish Structure Shift (CHoCH / MSS / BOS)",
    ruleAr: "إغلاق فوق قمة سابقة في آخر 40 شمعة (يبقى صالحًا حتى بعد تكوّن قمة أحدث)",
    ruleEn: "Close above prior swing high in last 40 candles (remains valid after newer highs)",
  },
  {
    num: 4,
    weight: STRATEGY_RULES.WEIGHTS.POI_MITIGATION,
    ar: "اختبار منطقة الاهتمام (Order Block شرائي أو FVG في الخصم)",
    en: "POI Mitigation (Bullish Order Block or FVG in Discount)",
    ruleAr: "البحث في آخر 60 شمعة وعودة السعر لاختبار المنطقة داخل الخصم",
    ruleEn: "Search last 60 candles and verify price retest inside Discount Zone",
  },
  {
    num: 5,
    weight: STRATEGY_RULES.WEIGHTS.DISPLACEMENT_VOLUME,
    ar: "الإزاحة الصاعدة وتأكيد الحجم (Displacement + Volume)",
    en: "Bullish Displacement + Volume Confirmation",
    ruleAr: "آخر 10 شموع أو شمعة الكسر نفسها: جسم ≥ 55% ومدى ≥ 0.9×ATR وحجم > متوسط 20",
    ruleEn: "Last 10 candles or break bar: body ≥ 55%, range ≥ 0.9×ATR, Vol > 20-bar avg",
  },
  {
    num: 6,
    weight: STRATEGY_RULES.WEIGHTS.DISCOUNT_ZONE,
    ar: "السعر في منطقة الخصم العميق — Discount Zone (< 50%)",
    en: "Price in Bottom Discount Zone (< 50% Equilibrium)",
    ruleAr: "رِجل الإعداد من القاع المكنوس لأعلى قمة بعد الكسر (احتياطيًا 90 شمعة) — البريميم > 50% مرفوض",
    ruleEn: "Measured on setup leg from swept low to post-break high (fallback 90 bars) — Premium > 50% rejected",
  },
];

export default function StrategyPanel({
  lang,
  compact = false,
  selectedTimeframes,
  entryMode,
  onChangeEntryMode,
}: StrategyPanelProps) {
  const totalWeight = CONDITIONS.reduce((s, c) => s + c.weight, 0);
  const activeThreshold =
    entryMode === "B" ? STRATEGY_RULES.STRICT.SCORE : STRATEGY_RULES.SCORE_THRESHOLD;
  const strictRules = [
    lang === "ar"
      ? `حد تأهل أعلى: ${STRATEGY_RULES.STRICT.SCORE}/100 بدل ${STRATEGY_RULES.SCORE_THRESHOLD}`
      : `Higher threshold: ${STRATEGY_RULES.STRICT.SCORE}/100 instead of ${STRATEGY_RULES.SCORE_THRESHOLD}`,
    lang === "ar"
      ? "كل الخطوات الستة مستوفاة بالكامل (لا يُقبل أي جزئي)"
      : "All six steps fully passed (no partial step accepted)",
    lang === "ar"
      ? `خصم عميق فقط: ≤ ${STRATEGY_RULES.STRICT.DEEP_DISCOUNT_MAX_PCT}% من المدى (وليس 50%)`
      : `Deep discount only: ≤ ${STRATEGY_RULES.STRICT.DEEP_DISCOUNT_MAX_PCT}% of the range (not 50%)`,
    lang === "ar"
      ? "SSL حقيقي (وليس Inducement) متبوع بكسر CHoCH/MSS بعد الكنس مباشرة"
      : "A real SSL sweep (not inducement) followed by CHoCH/MSS right after it",
    lang === "ar"
      ? `Order Block/FVG مُختبَر حديثًا وقريب من قاع السيولة المكنوس (≤ ${STRATEGY_RULES.STRICT.MAX_POI_DISTANCE_ATR}×ATR)`
      : `POI recently mitigated near the swept liquidity low (≤ ${STRATEGY_RULES.STRICT.MAX_POI_DISTANCE_ATR}×ATR)`,
    lang === "ar"
      ? `إزاحة بجسم ≥ ${STRATEGY_RULES.STRICT.MIN_BODY_PCT}% وحجم ≥ ${STRATEGY_RULES.STRICT.MIN_VOLUME_RATIO}× المتوسط`
      : `Displacement body ≥ ${STRATEGY_RULES.STRICT.MIN_BODY_PCT}% and volume ≥ ${STRATEGY_RULES.STRICT.MIN_VOLUME_RATIO}× average`,
    lang === "ar"
      ? `بوابات: R:R ≥ ${STRATEGY_RULES.STRICT.MIN_RR_TP2}R · سبريد ≤ ${STRATEGY_RULES.STRICT.MAX_SPREAD_PCT}% · سيولة ≥ $${STRATEGY_RULES.STRICT.MIN_VOLUME_24H_USDT.toLocaleString("en-US")}`
      : `Gates: R:R ≥ ${STRATEGY_RULES.STRICT.MIN_RR_TP2}R · spread ≤ ${STRATEGY_RULES.STRICT.MAX_SPREAD_PCT}% · volume ≥ $${STRATEGY_RULES.STRICT.MIN_VOLUME_24H_USDT.toLocaleString("en-US")}`,
  ];

  return (
    <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A2338] pb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#D4AF37]/15 border border-[#D4AF37]/35 flex items-center justify-center">
            <Target className="w-4 h-4 text-[#D4AF37]" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-[#F8FAFC]">
              {lang === "ar"
                ? "الاستراتيجية الجارية — SMC / ICT اصطياد القاع (Spot شراء فقط)"
                : "Active Strategy — SMC / ICT Bottom Hunting (Spot Long Only)"}
            </h3>
            <p className="text-[11px] text-[#94A3B8]">
              {lang === "ar"
                ? "درجة الإشارة (0–100) هي درجة قوة الإعداد وليست احتمال ربح · الفريمات النشطة: "
                : "Score (0–100) measures setup strength, NOT win probability · Active TFs: "}
              <span className="font-num text-[#D4AF37] font-semibold">
                {selectedTimeframes.join(" · ")}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs font-num">
          <span className="px-2.5 py-1 rounded-lg bg-[#121A2D] border border-[#1E293B] text-[#E2E8F0]">
            {lang === "ar" ? "مجموع الأوزان:" : "Total Weight:"}{" "}
            <strong className="text-[#D4AF37]">{totalWeight}/100</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-[#10B981]/15 border border-[#10B981]/35 text-[#10B981] font-bold">
            {lang === "ar" ? "حد التأهل:" : "Threshold:"} {activeThreshold}/100
          </span>
        </div>
      </div>

      {/* Entry mode selector: A stays exactly as it was; B is the strict strong-zones mode. */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#070B14] border border-[#1A2338] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[#F8FAFC]">
            {lang === "ar" ? "وضع دخول الصفقات:" : "Trade entry mode:"}
          </span>
          <div className="flex gap-1.5" role="group" aria-label={lang === "ar" ? "وضع دخول الصفقات" : "Trade entry mode"}>
            <button
              type="button"
              aria-pressed={entryMode === "A"}
              onClick={() => onChangeEntryMode?.("A")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                entryMode === "A"
                  ? "border-[#D4AF37] bg-[#D4AF37] text-[#070B14]"
                  : "border-[#1E293B] bg-[#0D1322] text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
            >
              A · {lang === "ar" ? "الأصلي كما هو" : "Original"}
            </button>
            <button
              type="button"
              aria-pressed={entryMode === "B"}
              onClick={() => onChangeEntryMode?.("B")}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                entryMode === "B"
                  ? "border-[#D4AF37] bg-[#D4AF37] text-[#070B14]"
                  : "border-[#1E293B] bg-[#0D1322] text-[#94A3B8] hover:text-[#F8FAFC]"
              }`}
            >
              B · {lang === "ar" ? "صارم — مناطق قوية" : "Strict — strong zones"}
            </button>
          </div>
        </div>
        <span className={`text-[11px] font-bold ${entryMode === "B" ? "text-[#D4AF37]" : "text-[#94A3B8]"}`}>
          {entryMode === "B"
            ? lang === "ar"
              ? "يعمل الآن: يدخل فقط من مناطق قوية"
              : "Active: entries only from strong zones"
            : lang === "ar"
              ? "يعمل الآن: المعايير الأصلية دون أي تغيير"
              : "Active: original criteria, unchanged"}
        </span>
      </div>

      {entryMode === "B" && (
        <div className="rounded-lg border border-[#D4AF37]/40 bg-[#D4AF37]/[0.06] p-3 space-y-2">
          <div className="text-xs font-extrabold text-[#E5C158]">
            {lang === "ar"
              ? "معايير الاختيار B الصارمة (إضافة فوق A — لا تُغيّر A أبدًا)"
              : "Strict Option B criteria (added on top of A — A is never modified)"}
          </div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-1.5 text-[11px] text-[#CBD5E1]">
            {strictRules.map((rule, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#D4AF37] shrink-0" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 6 Weighted Conditions */}
      <div className={`grid gap-2 ${compact ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1 md:grid-cols-2"}`}>
        {CONDITIONS.map((c) => (
          <div
            key={c.num}
            className="rounded-lg bg-[#070B14] border border-[#1A2338] p-3 flex items-start justify-between gap-3"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] text-[11px] font-bold font-num flex items-center justify-center shrink-0">
                  {c.num}
                </span>
                <span className="text-xs font-bold text-[#F8FAFC]">
                  {lang === "ar" ? c.ar : c.en}
                </span>
              </div>
              {!compact && (
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                  {lang === "ar" ? c.ruleAr : c.ruleEn}
                </p>
              )}
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded bg-[#121A2D] border border-[#D4AF37]/30 font-num text-xs font-bold text-[#D4AF37]">
              {c.weight}
            </span>
          </div>
        ))}
      </div>

      {/* Rules Footer (Hard Gates, SL/TP, Context-Only Indicators) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px]">
        <div className="rounded-lg bg-[#121A2D]/70 border border-[#1A2338] p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-[#E2E8F0]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#10B981]" />
            <span>{lang === "ar" ? "بوابات الجودة الصلبة (خارج الدرجة)" : "Hard Quality Gates (Outside Score)"}</span>
          </div>
          <p className="text-[#94A3B8] leading-relaxed">
            {lang === "ar"
              ? "ربح الهدف الأول TP1 ≥ 2% (لا توجد صفقات بربح أقل من 2%) · سيولة 24س ≥ $100K · سبريد ≤ 0.65% · عائد/مخاطرة حتى TP2 ≥ 1.5R · وقف ≥ 0.3×ATR."
              : "Min Profit TP1 ≥ 2.0% (no setups below 2%) · 24h Vol ≥ $100K · Spread ≤ 0.65% · R:R to TP2 ≥ 1.5R · Stop ≥ 0.3×ATR."}
          </p>
        </div>

        <div className="rounded-lg bg-[#121A2D]/70 border border-[#1A2338] p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-[#E2E8F0]">
            <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{lang === "ar" ? "قواعد الوقف والأهداف والرسوم" : "SL / Targets / Fees Rules"}</span>
          </div>
          <p className="text-[#94A3B8] leading-relaxed">
            {lang === "ar"
              ? "الوقف: قاع OB ← FVG ← SSL ← دعم ناقص 0.25×ATR · الأهداف: 1R / 2R / 3R مقصوصة عند المقاومات · قيمة الصفقة ثابتة 100 USDT · الرسوم 0.1%×2 + 0.05% انزلاق."
              : "SL: OB/FVG/SSL/Support − 0.25×ATR · Targets: 1R/2R/3R capped at resistance · Fixed 100 USDT · 0.1%/side fees + 0.05% slippage."}
          </p>
        </div>

        <div className="rounded-lg bg-[#121A2D]/70 border border-[#1A2338] p-2.5 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-[#E2E8F0]">
            <AlertTriangle className="w-3.5 h-3.5 text-[#D99B26]" />
            <span>{lang === "ar" ? "المؤشرات الكلاسيكية وKillzones (سياق فقط)" : "Classical Indicators & Killzones (Context Only)"}</span>
          </div>
          <p className="text-[#94A3B8] leading-relaxed">
            {lang === "ar"
              ? "EMA, RSI, MACD, ATR, Bollinger, VWAP, ADX, OBV, Stoch RSI, Pivots, Fib وجلسات لندن/نيويورك للسياق فقط ولا تؤهل أي صفقة وحدها."
              : "EMA, RSI, MACD, ATR, BB, VWAP, ADX, OBV, Stoch RSI, Pivots, Fib & Killzones are context-only and never qualify trades alone."}
          </p>
        </div>
      </div>
    </div>
  );
}
