"use client";

import React, { useState } from "react";
import {
  Activity,
  BarChart3,
  Clock,
  Edit3,
  Layers,
  Play,
  ShieldAlert,
  Star,
  Check,
  X,
} from "lucide-react";
import { ExchangeId, Language, Timeframe } from "@/lib/types";
import { SignalReason } from "@/db/schema";
import {
  fmtDateTime,
  fmtPct,
  fmtPrice,
  fmtTimeRemaining,
  fmtUsdt,
} from "./formatters";

export interface SignalItem {
  id: number;
  strategyName: string;
  symbol: string;
  baseAsset: string;
  exchange: ExchangeId;
  marketType: "CRYPTO" | "STOCK";
  sector: string;
  status: string;
  score: number;
  grade: string;
  primaryTimeframe: Timeframe;
  qualifiedTimeframes: Timeframe[];
  entryPrice: number;
  livePrice: number;
  priceDiffFromEntryPct: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  slPercent: number;
  tp1Percent: number;
  tp2Percent: number;
  tp3Percent: number;
  riskRewardTp2: number;
  riskLevel: string;
  tradeSizeUsdt: number;
  quantity: number;
  estimatedFeesUsdt: number;
  expectedProfitTp2Usdt: number;
  potentialLossUsdt: number;
  reasons: SignalReason[];
  discoveredAt: string;
  expiresAt: string;
}

interface SignalCardProps {
  signal: SignalItem;
  isFavorite: boolean;
  hasOpenTrade: boolean;
  lang: Language;
  onActivate: (signal: SignalItem) => Promise<void>;
  onAnalyze: (symbol: string, exchange: ExchangeId, tf: Timeframe) => void;
  onToggleFavorite: (symbol: string, exchange: ExchangeId, marketType: "CRYPTO" | "STOCK") => void;
  onUpdateLevels: (
    signalId: number,
    levels: { stopLoss: number; tp1: number; tp2: number; tp3: number }
  ) => Promise<void>;
}

export default function SignalCard({
  signal,
  isFavorite,
  hasOpenTrade,
  lang,
  onActivate,
  onAnalyze,
  onToggleFavorite,
  onUpdateLevels,
}: SignalCardProps) {
  const [activating, setActivating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [slInput, setSlInput] = useState(String(signal.stopLoss));
  const [tp1Input, setTp1Input] = useState(String(signal.tp1));
  const [tp2Input, setTp2Input] = useState(String(signal.tp2));
  const [tp3Input, setTp3Input] = useState(String(signal.tp3));
  const [editError, setEditError] = useState<string | null>(null);

  const isMultiTf = (signal.qualifiedTimeframes?.length || 1) > 1;
  const totalRange = Math.max(signal.tp3 - signal.stopLoss, 1e-12);
  const pctPos = (p: number) =>
    Math.max(0, Math.min(100, ((p - signal.stopLoss) / totalRange) * 100));

  const entryPos = pctPos(signal.entryPrice);
  const livePos = pctPos(signal.livePrice);
  const tp1Pos = pctPos(signal.tp1);
  const tp2Pos = pctPos(signal.tp2);

  // Score ring SVG geometry
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (signal.score / 100) * circumference;

  async function handleActivateClick() {
    setActivating(true);
    try {
      await onActivate(signal);
    } finally {
      setActivating(false);
    }
  }

  async function handleSaveEdit() {
    setSavingEdit(true);
    setEditError(null);
    try {
      await onUpdateLevels(signal.id, {
        stopLoss: Number(slInput),
        tp1: Number(tp1Input),
        tp2: Number(tp2Input),
        tp3: Number(tp3Input),
      });
      setEditing(false);
    } catch (err) {
      setEditError((err as Error).message);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="qannas-enter rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 flex flex-col gap-3.5 hover:border-[#D4AF37]/40 transition-colors">
      {/* Top Row: Identity + Score Ring */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onAnalyze(signal.symbol, signal.exchange, signal.primaryTimeframe)}
              className="text-base font-extrabold text-[#F8FAFC] hover:text-[#D4AF37] transition-colors cursor-pointer font-num"
            >
              {signal.baseAsset}
              <span className="text-[#64748B] font-normal text-xs">/USDT</span>
            </button>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#121A2D] border border-[#1E293B] text-[#CBD5E1]">
              {signal.exchange}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#D4AF37]/15 text-[#D4AF37] border border-[#D4AF37]/30">
              Spot
            </span>
            {signal.strategyName?.includes("STRICT") && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/35">
                {lang === "ar" ? "دخول B صارم" : "Strict B"}
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30">
              {signal.status}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#94A3B8]">
            <span>{signal.sector}</span>
            <span>•</span>
            <span className="text-[#D4AF37] font-semibold">
              {lang === "ar" ? "شراء (اصطياد قاع)" : "Spot Long (Bottom Hunt)"}
            </span>
            {signal.grade === "A+" && (
              <span className="px-1.5 py-0.2 rounded bg-[#D4AF37]/20 text-[#E5C158] font-bold text-[10px]">
                A+
              </span>
            )}
          </div>
        </div>

        {/* Score Ring */}
        <div
          className="flex flex-col items-center shrink-0"
          title={
            lang === "ar"
              ? "درجة قوة الإعداد من 100 — وليست احتمال ربح"
              : "Setup Strength Score (0–100) — NOT win probability"
          }
        >
          <div className="relative w-12 h-12 flex items-center justify-center">
            <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
              <circle
                cx="24"
                cy="24"
                r={radius}
                fill="none"
                stroke="#1E293B"
                strokeWidth="3.5"
              />
              <circle
                cx="24"
                cy="24"
                r={radius}
                fill="none"
                stroke={signal.score >= 80 ? "#D4AF37" : "#10B981"}
                strokeWidth="3.5"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute text-xs font-bold font-num text-[#F8FAFC]">
              {signal.score}
            </span>
          </div>
          <span className="text-[9px] text-[#64748B] mt-0.5">
            {lang === "ar" ? "قوة الإعداد" : "Strength"}
          </span>
        </div>
      </div>

      {/* Timeframe Row with Multi-TF Confluence Verdict */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#121A2D] px-3 py-2 border border-[#1A2338]">
        <div className="flex items-center gap-1.5 text-xs">
          <Layers className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span className="text-[#94A3B8]">
            {lang === "ar" ? "فريم الصفقة:" : "Timeframe:"}
          </span>
          <span className="font-num font-bold text-[#F8FAFC] px-1.5 py-0.5 rounded bg-[#070B14] border border-[#1E293B]">
            {signal.primaryTimeframe}
          </span>
        </div>

        {isMultiTf ? (
          <div className="flex flex-wrap items-center gap-1 text-[11px] font-semibold text-[#10B981]">
            <span>
              {lang === "ar"
                ? `متوافقة على عدة فريمات (${signal.qualifiedTimeframes.length})`
                : `Multi-TF Aligned (${signal.qualifiedTimeframes.length})`}
            </span>
            <span className="font-num text-[10px] px-1.5 py-0.5 rounded bg-[#10B981]/15 border border-[#10B981]/30">
              {signal.qualifiedTimeframes.join(" · ")}
            </span>
          </div>
        ) : (
          <div className="text-[11px] font-semibold text-[#D99B26]">
            {lang === "ar"
              ? `فريم واحد فقط (${signal.primaryTimeframe})`
              : `Single Timeframe Only (${signal.primaryTimeframe})`}
          </div>
        )}
      </div>

      {/* Price Grid: Entry, Live, SL (with SL%), TP1/TP2/TP3 (with TP%) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-[#070B14] border border-[#1A2338] p-2">
          <div className="text-[10px] text-[#94A3B8]">
            {lang === "ar" ? "سعر الدخول" : "Entry Price"}
          </div>
          <div className="font-num font-bold text-[#D4AF37] mt-0.5">
            {fmtPrice(signal.entryPrice)}
          </div>
          <div className="text-[10px] font-num text-[#64748B]">
            100 USDT
          </div>
        </div>

        <div className="rounded-lg bg-[#070B14] border border-[#1A2338] p-2">
          <div className="text-[10px] text-[#94A3B8]">
            {lang === "ar" ? "السعر الحي" : "Live Price"}
          </div>
          <div className="font-num font-bold text-[#F8FAFC] mt-0.5">
            {fmtPrice(signal.livePrice)}
          </div>
          <div
            className={`text-[10px] font-num font-semibold ${
              signal.priceDiffFromEntryPct >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
            }`}
          >
            {fmtPct(signal.priceDiffFromEntryPct)}
          </div>
        </div>

        <div className="rounded-lg bg-[#070B14] border border-[#EF4444]/30 p-2">
          <div className="text-[10px] text-[#EF4444]">
            {lang === "ar" ? "وقف الخسارة (SL)" : "Stop Loss (SL)"}
          </div>
          <div className="font-num font-bold text-[#F8FAFC] mt-0.5">
            {fmtPrice(signal.stopLoss)}
          </div>
          <div className="text-[10px] font-num font-semibold text-[#EF4444]">
            {fmtPct(signal.slPercent, false)}
          </div>
        </div>

        <div className="rounded-lg bg-[#070B14] border border-[#10B981]/25 p-2">
          <div className="text-[10px] text-[#10B981]">
            {lang === "ar" ? "الهدف الأول TP1" : "Target 1 (TP1)"}
          </div>
          <div className="font-num font-bold text-[#F8FAFC] mt-0.5">
            {fmtPrice(signal.tp1)}
          </div>
          <div className="text-[10px] font-num font-semibold text-[#10B981]">
            {fmtPct(signal.tp1Percent)}
          </div>
        </div>

        <div className="rounded-lg bg-[#070B14] border border-[#10B981]/30 p-2">
          <div className="text-[10px] text-[#10B981]">
            {lang === "ar" ? "الهدف الثاني TP2" : "Target 2 (TP2)"}
          </div>
          <div className="font-num font-bold text-[#F8FAFC] mt-0.5">
            {fmtPrice(signal.tp2)}
          </div>
          <div className="text-[10px] font-num font-semibold text-[#10B981]">
            {fmtPct(signal.tp2Percent)}
          </div>
        </div>

        <div className="rounded-lg bg-[#070B14] border border-[#10B981]/35 p-2">
          <div className="text-[10px] text-[#10B981]">
            {lang === "ar" ? "الهدف الثالث TP3" : "Target 3 (TP3)"}
          </div>
          <div className="font-num font-bold text-[#F8FAFC] mt-0.5">
            {fmtPrice(signal.tp3)}
          </div>
          <div className="text-[10px] font-num font-semibold text-[#10B981]">
            {fmtPct(signal.tp3Percent)}
          </div>
        </div>
      </div>

      {/* Price Journey Bar: SL -> Entry -> Live -> TP1 / TP2 / TP3 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px] text-[#64748B] font-num">
          <span className="text-[#EF4444]">SL</span>
          <span className="text-[#D4AF37]">
            {lang === "ar" ? "الدخول" : "Entry"}
          </span>
          <span className="text-[#10B981]">TP1 · TP2 · TP3</span>
        </div>
        <div dir="ltr" className="relative h-2 rounded-full bg-[#121A2D] overflow-visible">
          <div
            className="absolute top-0 bottom-0 left-0 rounded-l-full bg-[#EF4444]/35"
            style={{ width: `${entryPos}%` }}
          />
          <div
            className="absolute top-0 bottom-0 rounded-r-full bg-[#10B981]/25"
            style={{ left: `${entryPos}%`, right: 0 }}
          />
          {/* Entry Marker */}
          <div
            className="absolute top-[-2px] w-1 h-3 bg-[#D4AF37] rounded-full"
            style={{ left: `calc(${entryPos}% - 2px)` }}
          />
          {/* TP1 & TP2 Markers */}
          <div
            className="absolute top-0 w-0.5 h-2 bg-[#10B981]/70"
            style={{ left: `${tp1Pos}%` }}
          />
          <div
            className="absolute top-0 w-0.5 h-2 bg-[#10B981]"
            style={{ left: `${tp2Pos}%` }}
          />
          {/* Live Price Dot */}
          <div
            className="absolute top-[-3px] w-3.5 h-3.5 rounded-full bg-[#F8FAFC] border-2 border-[#D4AF37] shadow"
            style={{ left: `calc(${livePos}% - 7px)` }}
            title={`Live: ${fmtPrice(signal.livePrice)}`}
          />
        </div>
      </div>

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] rounded-lg bg-[#070B14] border border-[#1A2338] p-2.5">
        <div>
          <span className="text-[#64748B] block text-[10px]">
            {lang === "ar" ? "الربح المتوقع (TP2)" : "Est. Profit (TP2)"}
          </span>
          <span className="font-num font-bold text-[#10B981]">
            {fmtUsdt(signal.expectedProfitTp2Usdt, true)}
          </span>
        </div>
        <div>
          <span className="text-[#64748B] block text-[10px]">
            {lang === "ar" ? "الخسارة المحتملة" : "Potential Loss"}
          </span>
          <span className="font-num font-bold text-[#EF4444]">
            -{fmtUsdt(signal.potentialLossUsdt)}
          </span>
        </div>
        <div>
          <span className="text-[#64748B] block text-[10px]">
            {lang === "ar" ? "العائد للمخاطرة" : "R:R (TP2)"}
          </span>
          <span className="font-num font-bold text-[#F8FAFC]">
            1:{signal.riskRewardTp2.toFixed(2)}{" "}
            <span className="text-[10px] font-normal text-[#94A3B8]">
              ({signal.riskLevel})
            </span>
          </span>
        </div>
        <div>
          <span className="text-[#64748B] block text-[10px]">
            {lang === "ar" ? "الكمية / الرسوم" : "Qty / Est. Fees"}
          </span>
          <span className="font-num text-[#CBD5E1]">
            {signal.quantity >= 1
              ? signal.quantity.toFixed(3)
              : signal.quantity.toFixed(6)}{" "}
            <span className="text-[#64748B]">(${signal.estimatedFeesUsdt.toFixed(2)})</span>
          </span>
        </div>
      </div>

      {/* Highlighted "سبب الصفقة" Block (Saved at Discovery!) */}
      <div className="rounded-lg border border-[#D4AF37]/25 bg-[#D4AF37]/[0.05] p-2.5">
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#D4AF37] mb-1.5">
          <Activity className="w-3.5 h-3.5" />
          <span>{lang === "ar" ? "سبب الصفقة (مسجّل وقت الاكتشاف)" : "Setup Reasons (Recorded at Discovery)"}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(signal.reasons || []).map((r, i) => (
            <span
              key={`${r.code}-${i}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-[#0D1322] border border-[#1E293B] text-[#E2E8F0]"
              title={r.detail}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              <span>{lang === "ar" ? r.labelAr : r.labelEn}</span>
              <span className="font-num text-[10px] text-[#D4AF37]">+{r.points}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Inline Edit Form (if toggled) */}
      {editing && (
        <div className="rounded-lg border border-[#D4AF37]/40 bg-[#070B14] p-3 space-y-2">
          <div className="text-xs font-bold text-[#D4AF37]">
            {lang === "ar"
              ? "تعديل الوقف والأهداف (سعر الدخول ثابت)"
              : "Edit SL / Targets (Entry stays fixed)"}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <label className="space-y-1">
              <span className="text-[10px] text-[#EF4444]">SL</span>
              <input
                type="number"
                step="any"
                value={slInput}
                onChange={(e) => setSlInput(e.target.value)}
                className="w-full rounded bg-[#0D1322] border border-[#1E293B] px-2 py-1 font-num text-[#F8FAFC]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-[#10B981]">TP1</span>
              <input
                type="number"
                step="any"
                value={tp1Input}
                onChange={(e) => setTp1Input(e.target.value)}
                className="w-full rounded bg-[#0D1322] border border-[#1E293B] px-2 py-1 font-num text-[#F8FAFC]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-[#10B981]">TP2</span>
              <input
                type="number"
                step="any"
                value={tp2Input}
                onChange={(e) => setTp2Input(e.target.value)}
                className="w-full rounded bg-[#0D1322] border border-[#1E293B] px-2 py-1 font-num text-[#F8FAFC]"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[10px] text-[#10B981]">TP3</span>
              <input
                type="number"
                step="any"
                value={tp3Input}
                onChange={(e) => setTp3Input(e.target.value)}
                className="w-full rounded bg-[#0D1322] border border-[#1E293B] px-2 py-1 font-num text-[#F8FAFC]"
              />
            </label>
          </div>
          {editError && <div className="text-[11px] text-[#EF4444]">{editError}</div>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={savingEdit}
              onClick={handleSaveEdit}
              className="inline-flex items-center gap-1 px-3 py-1 rounded bg-[#D4AF37] text-[#070B14] text-xs font-bold cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {lang === "ar" ? "حفظ" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#1A2338] text-[#94A3B8] text-xs cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* Footer Timestamps & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#1A2338] text-[11px] text-[#64748B]">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5" />
          <span>{fmtDateTime(signal.discoveredAt, lang)}</span>
          <span>•</span>
          <span className="text-[#D99B26] font-medium">
            {fmtTimeRemaining(signal.expiresAt, lang)}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <button
          type="button"
          disabled={activating || hasOpenTrade}
          onClick={handleActivateClick}
          className={`col-span-2 sm:col-span-2 inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
            hasOpenTrade
              ? "bg-[#121A2D] text-[#64748B] border border-[#1E293B] cursor-not-allowed"
              : "bg-[#D4AF37] hover:bg-[#E5C158] text-[#070B14]"
          }`}
        >
          {hasOpenTrade ? (
            <>
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "صفقة مفتوحة بالفعل" : "Already Open"}</span>
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
                    ? "تفعيل الصفقة (100$)"
                    : "Track Trade ($100)"}
              </span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() =>
            onAnalyze(signal.symbol, signal.exchange, signal.primaryTimeframe)
          }
          className="inline-flex items-center justify-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold bg-[#121A2D] hover:bg-[#1A243C] text-[#E2E8F0] border border-[#1E293B] cursor-pointer"
        >
          <BarChart3 className="w-3.5 h-3.5 text-[#D4AF37]" />
          <span>{lang === "ar" ? "تحليل" : "Analyze"}</span>
        </button>

        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() =>
              onToggleFavorite(signal.symbol, signal.exchange, signal.marketType)
            }
            className={`flex-1 inline-flex items-center justify-center rounded-lg py-2 border transition-colors cursor-pointer ${
              isFavorite
                ? "bg-[#D99B26]/15 border-[#D99B26]/50 text-[#D99B26]"
                : "bg-[#121A2D] border-[#1E293B] text-[#94A3B8] hover:text-[#D99B26]"
            }`}
            title={lang === "ar" ? "مفضلة" : "Favorite"}
          >
            <Star className={`w-3.5 h-3.5 ${isFavorite ? "fill-[#D99B26]" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="flex-1 inline-flex items-center justify-center rounded-lg py-2 bg-[#121A2D] hover:bg-[#1A243C] border border-[#1E293B] text-[#94A3B8] hover:text-[#E2E8F0] cursor-pointer"
            title={lang === "ar" ? "تعديل المستويات" : "Edit Levels"}
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
