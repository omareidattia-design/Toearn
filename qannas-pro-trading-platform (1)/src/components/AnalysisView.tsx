"use client";

import React, { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Play,
  Star,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Lock,
  Info,
} from "lucide-react";
import {
  ALL_TIMEFRAMES,
  Candle,
  ExchangeId,
  Language,
  SmcAnalysisResult,
  Timeframe,
} from "@/lib/types";
import type { SavedChartPlan } from "@/lib/chart-data";
import TradingViewChart from "./TradingViewChart";
import { fmtPct, fmtPrice, fmtUsdt, fmtVol } from "./formatters";

interface AnalysisViewProps {
  analysis: SmcAnalysisResult | null;
  candles: Candle[];
  chartPlan: SavedChartPlan | null;
  loading: boolean;
  error: string | null;
  isFavorite: boolean;
  hasOpenTrade: boolean;
  lang: Language;
  onSelectTimeframe: (tf: Timeframe) => void;
  onRefresh: () => void;
  onToggleFavorite: (symbol: string, exchange: ExchangeId, marketType: "CRYPTO" | "STOCK") => void;
  onActivateFromAnalysis: (analysis: SmcAnalysisResult) => Promise<void>;
}

export default function AnalysisView({
  analysis,
  candles,
  chartPlan,
  loading,
  error,
  isFavorite,
  hasOpenTrade,
  lang,
  onSelectTimeframe,
  onRefresh,
  onToggleFavorite,
  onActivateFromAnalysis,
}: AnalysisViewProps) {
  const [activating, setActivating] = useState(false);

  if (loading && !analysis) {
    return (
      <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-10 text-center space-y-3">
        <RefreshCw className="w-7 h-7 text-[#D4AF37] animate-spin mx-auto" />
        <p className="text-sm text-[#94A3B8]">
          {lang === "ar"
            ? "جاري جلب الشموع الحية وتشغيل محرك SMC/ICT لاصطياد القاع على الفريمات الستة..."
            : "Fetching live candles and running 6-TF SMC/ICT Bottom-Hunting engine..."}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[#EF4444]/40 bg-[#0D1322] p-6 text-center space-y-2">
        <AlertCircle className="w-7 h-7 text-[#EF4444] mx-auto" />
        <div className="text-sm font-bold text-[#EF4444]">
          {lang === "ar" ? "تعذّر تحليل العملة من المصدر الحي" : "Failed to analyze live data"}
        </div>
        <div className="text-xs text-[#94A3B8] font-num">{error}</div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-10 text-center text-sm text-[#94A3B8]">
        {lang === "ar"
          ? "اضغط على أي عملة من الرادار أو قائمة كل العملات لتحليلها فورًا ببيانات حية."
          : "Click any coin from the Radar or Markets list to analyze it live."}
      </div>
    );
  }

  const tp = analysis.tradePlan;

  async function handleActivate() {
    if (!analysis || !analysis.qualified) return;
    setActivating(true);
    try {
      await onActivateFromAnalysis(analysis);
    } finally {
      setActivating(false);
    }
  }

  return (
    <div className="space-y-4 qannas-enter">
      {/* 1. HEADER & EXPLICIT VERDICT BANNER */}
      <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold font-num text-[#F8FAFC]">
                {analysis.baseAsset}
                <span className="text-[#64748B] font-normal text-sm">/USDT</span>
              </h2>
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-[#121A2D] border border-[#1E293B] text-[#E2E8F0]">
                {analysis.exchange} Spot
              </span>
              <span className="px-2 py-0.5 rounded text-xs bg-[#D4AF37]/15 border border-[#D4AF37]/30 text-[#D4AF37] font-semibold">
                {analysis.sector}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-num bg-[#070B14] border border-[#1E293B] text-[#CBD5E1]">
                {lang === "ar" ? "فريم التحليل:" : "TF:"} {analysis.timeframe}
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-4 font-num">
              <span className="text-2xl font-extrabold text-[#F8FAFC]">
                {fmtPrice(analysis.currentPrice)}
              </span>
              <span
                className={`text-sm font-bold ${
                  analysis.priceChange24h >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                }`}
              >
                {fmtPct(analysis.priceChange24h)} (24h)
              </span>
              <span className="text-xs text-[#94A3B8]">
                {lang === "ar" ? "الحجم 24س:" : "24h Vol:"}{" "}
                <strong className="text-[#E2E8F0]">{fmtVol(analysis.volume24hUsdt)}</strong>
              </span>
              <span className="text-xs text-[#94A3B8]">
                {lang === "ar" ? "السبريد:" : "Spread:"}{" "}
                <strong className="text-[#E2E8F0]">{analysis.spreadPct.toFixed(3)}%</strong>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Analysis timeframe selector */}
            <div className="flex items-center gap-1 rounded-lg bg-[#070B14] p-1 border border-[#1A2338]">
              {ALL_TIMEFRAMES.map((tf) => (
                <button
                  key={tf}
                  type="button"
                  onClick={() => onSelectTimeframe(tf)}
                  className={`px-2 py-1 rounded text-xs font-num font-bold cursor-pointer transition-colors ${
                    analysis.timeframe === tf
                      ? "bg-[#D4AF37] text-[#070B14]"
                      : "text-[#94A3B8] hover:text-white"
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onRefresh}
              className="p-2 rounded-lg bg-[#121A2D] hover:bg-[#1A243C] border border-[#1E293B] text-[#CBD5E1] cursor-pointer"
              title={lang === "ar" ? "تحديث حي" : "Refresh Live"}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#D4AF37]" : ""}`} />
            </button>

            <button
              type="button"
              onClick={() =>
                onToggleFavorite(analysis.symbol, analysis.exchange, analysis.marketType)
              }
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                isFavorite
                  ? "bg-[#D99B26]/15 border-[#D99B26]/50 text-[#D99B26]"
                  : "bg-[#121A2D] border-[#1E293B] text-[#94A3B8] hover:text-[#D99B26]"
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${isFavorite ? "fill-[#D99B26]" : ""}`} />
              <span>{lang === "ar" ? "مفضلة" : "Favorite"}</span>
            </button>

            {analysis.qualified && (
              <button
                type="button"
                disabled={activating || hasOpenTrade}
                onClick={handleActivate}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-extrabold cursor-pointer ${
                  hasOpenTrade
                    ? "bg-[#121A2D] text-[#64748B] border border-[#1E293B] cursor-not-allowed"
                    : "bg-[#D4AF37] hover:bg-[#E5C158] text-[#070B14]"
                }`}
              >
                {hasOpenTrade ? (
                  <>
                    <Lock className="w-3.5 h-3.5" />
                    <span>{lang === "ar" ? "صفقة مفتوحة بالفعل" : "Trade Open"}</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" />
                    <span>
                      {activating
                        ? lang === "ar"
                          ? "جاري التفعيل..."
                          : "Activating..."
                        : lang === "ar"
                          ? "تفعيل الصفقة (100 USDT)"
                          : "Track Trade (100 USDT)"}
                    </span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* VERDICT BOX */}
        <div
          className={`rounded-xl p-4 border flex flex-wrap items-center justify-between gap-4 ${
            analysis.qualified
              ? "bg-[#10B981]/10 border-[#10B981]/40"
              : "bg-[#EF4444]/[0.07] border-[#EF4444]/35"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {analysis.qualified ? (
                <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
              ) : (
                <XCircle className="w-5 h-5 text-[#EF4444]" />
              )}
              <span
                className={`text-base font-extrabold ${
                  analysis.qualified ? "text-[#10B981]" : "text-[#EF4444]"
                }`}
              >
                {analysis.qualified
                  ? lang === "ar"
                    ? "صفقة متاحة — إعداد اصطياد قاع مؤهل (Spot شراء)"
                    : "VALID TRADE SETUP — Qualified Spot Bottom-Hunt Long"
                  : lang === "ar"
                    ? "لا توجد صفقة — الإعداد غير مؤهل حاليًا"
                    : "NO VALID SETUP — Does Not Meet Strict Entry Criteria"}
              </span>
            </div>
            <p className="text-xs text-[#94A3B8]">
              {lang === "ar"
                ? `درجة قوة الإعداد: ${analysis.score}/100 مقابل حد التأهل ${analysis.threshold}/100 (درجة الإعداد تقيس اكتمال شروط SMC/ICT وليست احتمال ربح).`
                : `Setup Strength Score: ${analysis.score}/100 vs ${analysis.threshold}/100 threshold (measures SMC/ICT alignment, NOT win probability).`}
            </p>
            <div className="flex items-center gap-1.5 pt-1">
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  analysis.entryMode === "B"
                    ? "bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/35"
                    : "bg-[#121A2D] text-[#94A3B8] border border-[#1E293B]"
                }`}
              >
                {analysis.entryMode === "B"
                  ? lang === "ar"
                    ? "وضع الدخول B — صارم · يدخل من مناطق قوية فقط"
                    : "Entry Mode B — strict · strong zones only"
                  : lang === "ar"
                    ? "وضع الدخول A — المعايير الأصلية كما هي"
                    : "Entry Mode A — original criteria unchanged"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 font-num">
            <div className="text-center px-4 py-2 rounded-lg bg-[#070B14] border border-[#1A2338]">
              <div className="text-[10px] text-[#94A3B8]">
                {lang === "ar" ? "الدرجة / الحد" : "Score / Min"}
              </div>
              <div
                className={`text-lg font-extrabold ${
                  analysis.score >= analysis.threshold ? "text-[#10B981]" : "text-[#EF4444]"
                }`}
              >
                {analysis.score} <span className="text-xs text-[#64748B]">/ {analysis.threshold}</span>
              </div>
            </div>
            {analysis.qualifiedTimeframes && analysis.qualifiedTimeframes.length > 0 && (
              <div className="text-center px-3 py-2 rounded-lg bg-[#070B14] border border-[#10B981]/30">
                <div className="text-[10px] text-[#10B981]">
                  {lang === "ar" ? "الفريمات المؤهلة" : "Qualified TFs"}
                </div>
                <div className="text-xs font-bold text-[#F8FAFC] mt-0.5">
                  {analysis.qualifiedTimeframes.join(" · ")}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      <TradingViewChart
        key={`${analysis.exchange}:${analysis.symbol}:${analysis.timeframe}`}
        symbol={analysis.symbol}
        exchange={analysis.exchange}
        analysisTimeframe={analysis.timeframe}
        initialCandles={candles}
        levels={chartPlan ?? (analysis.qualified && tp ? { entry: tp.entryPrice, stopLoss: tp.stopLoss, tp1: tp.tp1, tp2: tp.tp2, tp3: tp.tp3 } : null)}
        zones={chartPlan?.zones.length ? chartPlan.zones : analysis.zones}
        zoneTimeframe={chartPlan?.zones.length ? chartPlan.timeframe : analysis.timeframe}
        lang={lang}
      />

      <div>
        {/* 2. "WHAT'S MISSING TO QUALIFY" (For Unqualified Coins) OR ACCEPTED REASONS */}
        {!analysis.qualified ? (
          <div className="rounded-xl border border-[#D99B26]/35 bg-[#D99B26]/[0.05] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-extrabold text-[#D99B26]">
                {lang === "ar"
                  ? "ما الذي ينقص للتأهل؟ (قراءة رقمية حقيقية)"
                  : "What Is Missing to Qualify? (Real Numeric Audit)"}
              </div>
              <div className="flex items-center gap-3 text-xs font-num">
                <span className="text-[#E2E8F0]">
                  {lang === "ar" ? "الخطوات المستوفاة:" : "Passed Steps:"}{" "}
                  <strong className="text-[#D4AF37]">{analysis.passedStepsCount} / 6</strong>
                </span>
                <span className="text-[#EF4444]">
                  {lang === "ar" ? "فجوة النقاط عن 58:" : "Gap to 58:"}{" "}
                  <strong>{analysis.scoreGap > 0 ? `-${analysis.scoreGap}` : "0 (فشل تسلسل/بوابة)"}</strong>
                </span>
              </div>
            </div>

            {/* Segmented 6-Step Bar */}
            <div className="grid grid-cols-6 gap-1.5">
              {analysis.steps.map((st) => (
                <div key={st.stepNumber} className="space-y-1">
                  <div
                    className={`h-2 rounded-full ${
                      st.status === "PASS"
                        ? "bg-[#10B981]"
                        : st.status === "PARTIAL"
                          ? "bg-[#D99B26]"
                          : "bg-[#EF4444]/60"
                    }`}
                  />
                  <div className="text-[10px] text-center font-num text-[#94A3B8]">
                    {st.stepNumber}. {st.score}/{st.weight}
                  </div>
                </div>
              ))}
            </div>

            {/* Named Rejection Chips */}
            <div className="flex flex-wrap gap-1.5">
              {analysis.rejectionReasons.map((rr) => (
                <span
                  key={rr.code}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D1322] border border-[#EF4444]/35 text-xs text-[#FCA5A5]"
                >
                  <span className="font-num font-bold text-[#EF4444] text-[10px]">
                    {rr.code}
                  </span>
                  <span>{lang === "ar" ? rr.labelAr : rr.labelEn}</span>
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[#10B981]/30 bg-[#10B981]/[0.05] p-3">
            <div className="text-xs font-bold text-[#10B981] mb-2">
              {lang === "ar" ? "أسباب القبول المؤكّدة:" : "Confirmed Qualification Reasons:"}
            </div>
            <div className="flex flex-wrap gap-2">
              {analysis.signalReasons.map((r, idx) => (
                <span
                  key={`${r.code}-${idx}`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0D1322] border border-[#10B981]/30 text-xs text-[#E2E8F0]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#10B981]" />
                  <span>{lang === "ar" ? r.labelAr : r.labelEn}</span>
                  <span className="font-num text-[#D4AF37] font-bold">+{r.points}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 3. NUMBERED 6-STEP STRATEGY TIMELINE */}
      <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-[#1A2338] pb-3">
          <h3 className="text-sm font-extrabold text-[#F8FAFC]">
            {lang === "ar"
              ? "التحليل المرقّم خطوة بخطوة — استراتيجية SMC / ICT لاصطياد القاع"
              : "6-Step Numbered Audit — SMC / ICT Bottom-Hunting Engine"}
          </h3>
          <span className="text-xs font-num text-[#D4AF37] font-bold">
            {analysis.score} / 100
          </span>
        </div>

        <div className="space-y-3">
          {analysis.steps.map((step) => {
            const statusColor =
              step.status === "PASS"
                ? "text-[#10B981] bg-[#10B981]/15 border-[#10B981]/35"
                : step.status === "PARTIAL"
                  ? "text-[#D99B26] bg-[#D99B26]/15 border-[#D99B26]/35"
                  : "text-[#EF4444] bg-[#EF4444]/15 border-[#EF4444]/35";
            const statusLabel =
              step.status === "PASS"
                ? lang === "ar"
                  ? "مستوفى"
                  : "PASS"
                : step.status === "PARTIAL"
                  ? lang === "ar"
                    ? "جزئي"
                    : "PARTIAL"
                  : lang === "ar"
                    ? "غير مستوفى"
                    : "FAIL";

            return (
              <div
                key={step.stepNumber}
                className="rounded-xl bg-[#070B14] border border-[#1A2338] p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-[#D4AF37]/15 border border-[#D4AF37]/40 text-[#D4AF37] text-xs font-extrabold font-num flex items-center justify-center">
                      {step.stepNumber}
                    </span>
                    <span className="text-sm font-bold text-[#F8FAFC]">
                      {lang === "ar" ? step.titleAr : step.titleEn}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${statusColor}`}>
                      {statusLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[#121A2D] font-num text-xs font-bold text-[#D4AF37]">
                      {step.score} / {step.weight}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-[#CBD5E1] leading-relaxed">
                  {lang === "ar" ? step.summaryAr : step.summaryEn}
                </p>

                {/* Real Metric Badges */}
                <div className="flex flex-wrap gap-2">
                  {Object.entries(step.metrics).map(([k, v]) =>
                    v !== null && v !== "" ? (
                      <span
                        key={k}
                        className="px-2 py-0.5 rounded bg-[#0D1322] border border-[#1E293B] text-[11px] font-num text-[#94A3B8]"
                      >
                        {k}: <strong className="text-[#E2E8F0]">{String(v)}</strong>
                      </span>
                    ) : null
                  )}
                </div>

                {/* Step 4 & 6 visual Discount / Premium Gauge */}
                {step.stepNumber === 6 && (
                  <div className="pt-2 space-y-1.5">
                    <div className="flex justify-between text-[11px] font-num">
                      <span className="text-[#10B981]">
                        {lang === "ar" ? "قاع المدى (0%):" : "Low (0%):"}{" "}
                        {fmtPrice(analysis.discountRange.low)}
                      </span>
                      <span className="text-[#D4AF37]">
                        {lang === "ar" ? "التوازن (50%):" : "EQ (50%):"}{" "}
                        {fmtPrice(analysis.discountRange.equilibrium)}
                      </span>
                      <span className="text-[#EF4444]">
                        {lang === "ar" ? "قمة المدى (100%):" : "High (100%):"}{" "}
                        {fmtPrice(analysis.discountRange.high)}
                      </span>
                    </div>
                    <div dir="ltr" className="relative h-3 rounded-full overflow-hidden bg-[#121A2D] flex">
                      <div className="w-1/2 bg-[#10B981]/30 border-r border-[#D4AF37]" />
                      <div className="w-1/2 bg-[#EF4444]/25" />
                      <div
                        className="absolute top-0 bottom-0 w-1.5 bg-[#F8FAFC] shadow"
                        style={{
                          left: `calc(${Math.min(98, Math.max(2, analysis.discountRange.positionPct))}% - 3px)`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Trade Plan Details Box (Part of Step 6) */}
        {tp && (
          <div className="rounded-xl border border-[#D4AF37]/30 bg-[#070B14] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-extrabold text-[#D4AF37]">
                {lang === "ar"
                  ? "خطة الصفقة المحسوبة بالأرقام الحية (قيمة ثابتة 100 USDT · Spot شراء)"
                  : "Calculated Spot Trade Plan (Fixed 100 USDT · Spot Long)"}
              </h4>
              <span className="text-[11px] font-num text-[#94A3B8]">
                R:R (TP2) = <strong className="text-[#10B981]">1:{tp.riskRewardTp2.toFixed(2)}</strong> ·{" "}
                {lang === "ar" ? "الرسوم التقديرية:" : "Est. Fees:"} ${tp.estimatedFeesUsdt.toFixed(2)} (0.1%×2 + 0.05%)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
              <div className="rounded-lg bg-[#0D1322] border border-[#D4AF37]/30 p-2.5 space-y-1">
                <div className="text-[10px] text-[#D4AF37] font-bold">
                  {lang === "ar" ? "الدخول (Entry)" : "Entry"}
                </div>
                <div className="font-num font-extrabold text-[#F8FAFC]">
                  {fmtPrice(tp.entryPrice)}
                </div>
                <div className="text-[10px] text-[#94A3B8]">
                  {lang === "ar" ? tp.entryReasonAr : tp.entryReasonEn}
                </div>
              </div>

              <div className="rounded-lg bg-[#0D1322] border border-[#EF4444]/35 p-2.5 space-y-1">
                <div className="text-[10px] text-[#EF4444] font-bold">
                  {lang === "ar" ? "وقف الخسارة (SL)" : "Stop Loss"} ({fmtPct(tp.slPercent, false)})
                </div>
                <div className="font-num font-extrabold text-[#F8FAFC]">
                  {fmtPrice(tp.stopLoss)}
                </div>
                <div className="text-[10px] text-[#94A3B8]">
                  {lang === "ar"
                    ? `${tp.slReferenceNameAr} (${fmtPrice(tp.slReferencePrice)}) − 0.25×ATR (${tp.slAtrMultiple.toFixed(2)}×ATR)`
                    : `${tp.slReferenceNameEn} (${fmtPrice(tp.slReferencePrice)}) − 0.25×ATR (${tp.slAtrMultiple.toFixed(2)}×ATR)`}
                </div>
              </div>

              {[
                { label: "TP1", p: tp.tp1, pct: tp.tp1Percent, r: tp.tp1R, bAr: tp.tp1BasisAr, bEn: tp.tp1BasisEn },
                { label: "TP2", p: tp.tp2, pct: tp.tp2Percent, r: tp.tp2R, bAr: tp.tp2BasisAr, bEn: tp.tp2BasisEn },
                { label: "TP3", p: tp.tp3, pct: tp.tp3Percent, r: tp.tp3R, bAr: tp.tp3BasisAr, bEn: tp.tp3BasisEn },
              ].map((t) => (
                <div
                  key={t.label}
                  className="rounded-lg bg-[#0D1322] border border-[#10B981]/30 p-2.5 space-y-1"
                >
                  <div className="text-[10px] text-[#10B981] font-bold">
                    {t.label} ({fmtPct(t.pct)} · {t.r.toFixed(2)}R)
                  </div>
                  <div className="font-num font-extrabold text-[#F8FAFC]">
                    {fmtPrice(t.p)}
                  </div>
                  <div className="text-[10px] text-[#94A3B8]">
                    {lang === "ar" ? t.bAr : t.bEn}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-4 text-[11px] font-num text-[#94A3B8] pt-1">
              <span>
                {lang === "ar" ? "الكمية:" : "Qty:"}{" "}
                <strong className="text-[#F8FAFC]">{tp.quantity.toFixed(6)} {analysis.baseAsset}</strong>
              </span>
              <span>
                {lang === "ar" ? "صافي الربح المتوقع عند TP2:" : "Net Profit @ TP2:"}{" "}
                <strong className="text-[#10B981]">{fmtUsdt(tp.expectedProfitTp2Usdt, true)}</strong>
              </span>
              <span>
                {lang === "ar" ? "الخسارة المحتملة عند SL:" : "Max Loss @ SL:"}{" "}
                <strong className="text-[#EF4444]">-{fmtUsdt(tp.potentialLossUsdt)}</strong>
              </span>
              <span>
                {lang === "ar" ? "إبطال ICT (إغلاق أسفل):" : "ICT Invalidation:"}{" "}
                <strong className="text-[#EF4444]">{fmtPrice(tp.invalidationPrice)}</strong>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 4. HARD QUALITY GATES + 5. CONFLUENCE LAYER (CONTEXT ONLY) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Quality Gates */}
        <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-3">
          <div className="flex items-center gap-2 border-b border-[#1A2338] pb-2.5">
            <ShieldCheck className="w-4 h-4 text-[#D4AF37]" />
            <h3 className="text-sm font-extrabold text-[#F8FAFC]">
              {lang === "ar"
                ? "بوابات الجودة الصلبة (نجاح / فشل)"
                : "Hard Quality Gates (Pass / Fail)"}
            </h3>
          </div>
          <div className="space-y-2">
            {analysis.qualityGates.map((g) => (
              <div
                key={g.key}
                className="flex items-center justify-between gap-2 rounded-lg bg-[#070B14] border border-[#1A2338] px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  {g.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-[#10B981] shrink-0" />
                  ) : (
                    <XCircle className="w-4 h-4 text-[#EF4444] shrink-0" />
                  )}
                  <span className="text-[#E2E8F0] font-medium">
                    {lang === "ar" ? g.labelAr : g.labelEn}
                  </span>
                </div>
                <div className="flex items-center gap-2 font-num">
                  <strong className={g.passed ? "text-[#10B981]" : "text-[#EF4444]"}>
                    {g.actualDisplay}
                  </strong>
                  <span className="text-[11px] text-[#64748B]">({g.thresholdDisplay})</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 5-Factor Confluence Layer (Context Only — ZERO points added!) */}
        <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A2338] pb-2.5">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-[#D4AF37]" />
              <h3 className="text-sm font-extrabold text-[#F8FAFC]">
                {lang === "ar" ? "طبقة التوافق الخماسية (Confluence)" : "5-Factor Confluence Layer"}
              </h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded text-xs font-extrabold font-num ${
                analysis.confluence.rating === "STRONG"
                  ? "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/35"
                  : analysis.confluence.rating === "GOOD"
                    ? "bg-[#D99B26]/15 text-[#D99B26] border border-[#D99B26]/35"
                    : "bg-[#1E293B] text-[#94A3B8]"
              }`}
            >
              {analysis.confluence.rating} ({analysis.confluence.bullishCount}/5)
            </span>
          </div>

          <div className="rounded-lg bg-[#D4AF37]/[0.06] border border-[#D4AF37]/25 px-3 py-1.5 text-[11px] text-[#E5C158]">
            {lang === "ar"
              ? analysis.confluence.disclaimerAr
              : analysis.confluence.disclaimerEn}
          </div>

          <div className="space-y-2">
            {analysis.confluence.factors.map((f) => (
              <div
                key={f.key}
                className="flex items-start justify-between gap-2 rounded-lg bg-[#070B14] border border-[#1A2338] px-3 py-2 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-[#E2E8F0]">
                    {lang === "ar" ? f.labelAr : f.labelEn}
                  </div>
                  <div className="text-[11px] text-[#94A3B8]">
                    {lang === "ar" ? f.detailAr : f.detailEn}
                  </div>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${
                    f.status === "BULLISH"
                      ? "bg-[#10B981]/15 text-[#10B981]"
                      : f.status === "BEARISH"
                        ? "bg-[#EF4444]/15 text-[#EF4444]"
                        : "bg-[#1E293B] text-[#94A3B8]"
                  }`}
                >
                  {f.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. CONTEXT-ONLY CLASSICAL INDICATORS TABLE + S/R + SCENARIOS */}
      <div className="rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A2338] pb-2.5">
          <h3 className="text-sm font-extrabold text-[#F8FAFC]">
            {lang === "ar"
              ? "جدول المؤشرات الكلاسيكية لجميع الفريمات (سياق فقط — لا تؤهل الصفقة وحدها)"
              : "All-Timeframe Classical Indicators (Context Only)"}
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead>
              <tr className="border-b border-[#1A2338] text-[#94A3B8] text-[11px]">
                <th className="py-2 px-2">TF</th>
                <th className="py-2 px-2">{lang === "ar" ? "الاتجاه" : "Trend"}</th>
                <th className="py-2 px-2">EMA20 / EMA50</th>
                <th className="py-2 px-2">RSI(14)</th>
                <th className="py-2 px-2">MACD</th>
                <th className="py-2 px-2">ATR%</th>
                <th className="py-2 px-2">ADX</th>
                <th className="py-2 px-2">Stoch RSI</th>
                <th className="py-2 px-2">VWAP</th>
                <th className="py-2 px-2">OBV</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1A2338]/70 font-num">
              {analysis.indicatorsByTimeframe.map((ind) => (
                <tr key={ind.timeframe} className="hover:bg-[#121A2D]/60">
                  <td className="py-2 px-2 font-bold text-[#D4AF37]">{ind.timeframe}</td>
                  <td className="py-2 px-2">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        ind.trendLabel === "BULLISH"
                          ? "bg-[#10B981]/15 text-[#10B981]"
                          : ind.trendLabel === "BEARISH"
                            ? "bg-[#EF4444]/15 text-[#EF4444]"
                            : "bg-[#1E293B] text-[#94A3B8]"
                      }`}
                    >
                      {ind.trendLabel}
                    </span>
                  </td>
                  <td className="py-2 px-2 text-[#CBD5E1]">
                    {fmtPrice(ind.ema20)} / {fmtPrice(ind.ema50)}
                  </td>
                  <td
                    className={`py-2 px-2 font-bold ${
                      ind.rsi14 <= 35
                        ? "text-[#10B981]"
                        : ind.rsi14 >= 70
                          ? "text-[#EF4444]"
                          : "text-[#E2E8F0]"
                    }`}
                  >
                    {ind.rsi14.toFixed(1)}
                  </td>
                  <td
                    className={`py-2 px-2 ${
                      ind.macdHistogram >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
                    }`}
                  >
                    {ind.macdHistogram >= 0 ? "+" : ""}
                    {ind.macdHistogram.toFixed(4)}
                  </td>
                  <td className="py-2 px-2 text-[#CBD5E1]">{ind.atrPct.toFixed(2)}%</td>
                  <td className="py-2 px-2 text-[#CBD5E1]">{ind.adx14.toFixed(1)}</td>
                  <td className="py-2 px-2 text-[#CBD5E1]">
                    {ind.stochRsiK.toFixed(0)}/{ind.stochRsiD.toFixed(0)}
                  </td>
                  <td className="py-2 px-2 text-[#CBD5E1]">{fmtPrice(ind.vwap)}</td>
                  <td
                    className={`py-2 px-2 font-bold ${
                      ind.obvTrend === "UP"
                        ? "text-[#10B981]"
                        : ind.obvTrend === "DOWN"
                          ? "text-[#EF4444]"
                          : "text-[#94A3B8]"
                    }`}
                  >
                    {ind.obvTrend}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* S/R, Pivots, Fibonacci & Bullish/Bearish Scenarios */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="rounded-lg bg-[#070B14] border border-[#1A2338] p-3 space-y-2 text-xs">
            <div className="font-bold text-[#D4AF37]">
              {lang === "ar" ? "الدعوم والمقاومات" : "Supports & Resistances"}
            </div>
            <div className="space-y-1 font-num">
              <div className="text-[11px] text-[#EF4444]">
                R: {analysis.levels.resistances.map(fmtPrice).join(" · ") || "—"}
              </div>
              <div className="text-[11px] text-[#10B981]">
                S: {analysis.levels.supports.map(fmtPrice).join(" · ") || "—"}
              </div>
            </div>
            <div className="pt-1 border-t border-[#1A2338] text-[11px] font-num text-[#94A3B8]">
              PP {fmtPrice(analysis.levels.pivot.pp)} · R1 {fmtPrice(analysis.levels.pivot.r1)} · S1{" "}
              {fmtPrice(analysis.levels.pivot.s1)}
            </div>
          </div>

          <div className="rounded-lg bg-[#070B14] border border-[#1A2338] p-3 space-y-1.5 text-xs">
            <div className="font-bold text-[#D4AF37]">
              {lang === "ar" ? "مستويات فيبوناتشي (90 شمعة)" : "Fibonacci Levels (90 bars)"}
            </div>
            <div className="grid grid-cols-2 gap-1 text-[11px] font-num text-[#CBD5E1]">
              <span>0.236: {fmtPrice(analysis.levels.fibonacci.fib236)}</span>
              <span>0.382: {fmtPrice(analysis.levels.fibonacci.fib382)}</span>
              <span className="text-[#D4AF37]">0.500: {fmtPrice(analysis.levels.fibonacci.fib500)}</span>
              <span className="text-[#10B981]">0.618: {fmtPrice(analysis.levels.fibonacci.fib618)}</span>
              <span className="text-[#10B981]">0.786: {fmtPrice(analysis.levels.fibonacci.fib786)}</span>
            </div>
          </div>

          <div className="rounded-lg bg-[#070B14] border border-[#1A2338] p-3 space-y-2 text-xs">
            <div className="flex items-start gap-1.5">
              <TrendingUp className="w-4 h-4 text-[#10B981] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#CBD5E1] leading-relaxed">
                {lang === "ar" ? analysis.scenarios.bullishAr : analysis.scenarios.bullishEn}
              </p>
            </div>
            <div className="flex items-start gap-1.5 pt-1 border-t border-[#1A2338]">
              <TrendingDown className="w-4 h-4 text-[#EF4444] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                {lang === "ar" ? analysis.scenarios.bearishAr : analysis.scenarios.bearishEn}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
