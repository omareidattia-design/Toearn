"use client";

import React, { useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  Edit3,
  Lock,
  Power,
  Check,
  X,
} from "lucide-react";
import { ExchangeId, Language, Timeframe } from "@/lib/types";
import { SignalReason } from "@/db/schema";
import { fmtDateTime, fmtPct, fmtPrice, fmtUsdt } from "./formatters";

export interface TradeItem {
  id: number;
  symbol: string;
  baseAsset: string;
  exchange: ExchangeId;
  marketType: "CRYPTO" | "STOCK";
  sector: string;
  status: string;
  primaryTimeframe: Timeframe;
  qualifiedTimeframes: Timeframe[];
  originalScore: number;
  entryPrice: number;
  livePrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  tp1Hit: boolean;
  tp2Hit: boolean;
  tp3Hit: boolean;
  tradeSizeUsdt: number;
  quantity: number;
  estimatedFeesUsdt: number;
  reasons: SignalReason[];
  unrealizedPnlUsdt: number;
  unrealizedPnlPercent: number;
  realizedPnlUsdt: number | null;
  realizedPnlPercent: number | null;
  remainingToTp1Pct: number;
  closePrice: number | null;
  closeReason: string | null;
  openedAt: string;
  closedAt: string | null;
  events?: Array<{
    id: number;
    eventType: string;
    price: number;
    messageAr: string;
    messageEn: string;
    createdAt: string;
  }>;
}

interface TradeCardProps {
  trade: TradeItem;
  lang: Language;
  onClose: (tradeId: number) => Promise<void>;
  onAnalyze: (symbol: string, exchange: ExchangeId, tf: Timeframe) => void;
  onUpdateLevels: (
    tradeId: number,
    levels: { stopLoss: number; tp1: number; tp2: number; tp3: number }
  ) => Promise<void>;
}

export default function TradeCard({
  trade,
  lang,
  onClose,
  onAnalyze,
  onUpdateLevels,
}: TradeCardProps) {
  const [closing, setClosing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [slInput, setSlInput] = useState(String(trade.stopLoss));
  const [tp1Input, setTp1Input] = useState(String(trade.tp1));
  const [tp2Input, setTp2Input] = useState(String(trade.tp2));
  const [tp3Input, setTp3Input] = useState(String(trade.tp3));
  const [err, setErr] = useState<string | null>(null);

  const isOpen = trade.status === "OPEN";
  const pnlUsdt = isOpen ? trade.unrealizedPnlUsdt : (trade.realizedPnlUsdt ?? 0);
  const pnlPct = isOpen ? trade.unrealizedPnlPercent : (trade.realizedPnlPercent ?? 0);

  const tpProgress = (target: number) => {
    const denom = target - trade.entryPrice;
    if (denom <= 0) return 0;
    return Math.max(0, Math.min(100, ((trade.livePrice - trade.entryPrice) / denom) * 100));
  };

  const totalRange = Math.max(trade.tp3 - trade.stopLoss, 1e-12);
  const pos = (p: number) =>
    Math.max(0, Math.min(100, ((p - trade.stopLoss) / totalRange) * 100));

  async function handleClose() {
    setClosing(true);
    try {
      await onClose(trade.id);
    } finally {
      setClosing(false);
    }
  }

  async function handleSave() {
    setErr(null);
    try {
      await onUpdateLevels(trade.id, {
        stopLoss: Number(slInput),
        tp1: Number(tp1Input),
        tp2: Number(tp2Input),
        tp3: Number(tp3Input),
      });
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="qannas-enter rounded-xl border border-[#1A2338] bg-[#0D1322] p-4 flex flex-col gap-3.5">
      {/* Header + Floating/Realized PnL */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onAnalyze(trade.symbol, trade.exchange, trade.primaryTimeframe)}
              className="text-base font-extrabold text-[#F8FAFC] hover:text-[#D4AF37] font-num cursor-pointer"
            >
              {trade.baseAsset}
              <span className="text-[#64748B] font-normal text-xs">/USDT</span>
            </button>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#121A2D] border border-[#1E293B] text-[#CBD5E1]">
              {trade.exchange} Spot
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-num font-bold bg-[#070B14] border border-[#D4AF37]/30 text-[#D4AF37]">
              {trade.primaryTimeframe} · {trade.originalScore}/100
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                isOpen
                  ? "bg-[#10B981]/15 text-[#10B981] border border-[#10B981]/30"
                  : trade.status === "CLOSED_SL"
                    ? "bg-[#EF4444]/15 text-[#EF4444] border border-[#EF4444]/30"
                    : "bg-[#1E293B] text-[#CBD5E1]"
              }`}
            >
              {trade.status}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
            <Lock className="w-3 h-3 text-[#D4AF37]" />
            <span>
              {lang === "ar" ? "سعر الدخول المجمّد:" : "Frozen Entry:"}{" "}
              <strong className="font-num text-[#D4AF37]">{fmtPrice(trade.entryPrice)}</strong>
            </span>
            <span>•</span>
            <span className="font-num">100 USDT</span>
          </div>
        </div>

        <div className="text-left shrink-0">
          <div className="text-[10px] text-[#64748B]">
            {isOpen
              ? lang === "ar"
                ? "الربح/الخسارة الحي"
                : "Floating PnL"
              : lang === "ar"
                ? "النتيجة المحققة"
                : "Realized PnL"}
          </div>
          <div
            className={`text-lg font-extrabold font-num ${
              pnlUsdt >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
            }`}
          >
            {fmtUsdt(pnlUsdt, true)}
          </div>
          <div
            className={`text-xs font-num font-semibold ${
              pnlPct >= 0 ? "text-[#10B981]" : "text-[#EF4444]"
            }`}
          >
            {fmtPct(pnlPct)}
          </div>
        </div>
      </div>

      {/* Key Price Cells */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <div className="rounded-lg bg-[#070B14] border border-[#1A2338] p-2">
          <span className="text-[10px] text-[#94A3B8] block">
            {lang === "ar" ? "السعر الحي" : "Live"}
          </span>
          <span className="font-num font-bold text-[#F8FAFC]">{fmtPrice(trade.livePrice)}</span>
        </div>
        <div className="rounded-lg bg-[#070B14] border border-[#EF4444]/30 p-2">
          <span className="text-[10px] text-[#EF4444] block">SL</span>
          <span className="font-num font-bold text-[#F8FAFC]">{fmtPrice(trade.stopLoss)}</span>
          <span className="block text-[10px] font-num text-[#EF4444]">
            {fmtPct(((trade.stopLoss - trade.entryPrice) / trade.entryPrice) * 100, false)}
          </span>
        </div>
        <div className="rounded-lg bg-[#070B14] border border-[#10B981]/25 p-2">
          <span className="text-[10px] text-[#10B981] flex items-center justify-between">
            <span>TP1</span>
            {trade.tp1Hit && <CheckCircle2 className="w-3 h-3" />}
          </span>
          <span className="font-num font-bold text-[#F8FAFC]">{fmtPrice(trade.tp1)}</span>
          <span className="block text-[10px] font-num text-[#10B981]">
            {fmtPct(((trade.tp1 - trade.entryPrice) / trade.entryPrice) * 100)}
          </span>
        </div>
        <div className="rounded-lg bg-[#070B14] border border-[#10B981]/30 p-2">
          <span className="text-[10px] text-[#10B981] flex items-center justify-between">
            <span>TP2</span>
            {trade.tp2Hit && <CheckCircle2 className="w-3 h-3" />}
          </span>
          <span className="font-num font-bold text-[#F8FAFC]">{fmtPrice(trade.tp2)}</span>
          <span className="block text-[10px] font-num text-[#10B981]">
            {fmtPct(((trade.tp2 - trade.entryPrice) / trade.entryPrice) * 100)}
          </span>
        </div>
        <div className="rounded-lg bg-[#070B14] border border-[#10B981]/35 p-2">
          <span className="text-[10px] text-[#10B981] flex items-center justify-between">
            <span>TP3</span>
            {trade.tp3Hit && <CheckCircle2 className="w-3 h-3" />}
          </span>
          <span className="font-num font-bold text-[#F8FAFC]">{fmtPrice(trade.tp3)}</span>
          <span className="block text-[10px] font-num text-[#10B981]">
            {fmtPct(((trade.tp3 - trade.entryPrice) / trade.entryPrice) * 100)}
          </span>
        </div>
      </div>

      {/* Live Price Journey Bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-[#94A3B8]">
          <span>
            {lang === "ar" ? "المتبقي حتى TP1:" : "Remaining to TP1:"}{" "}
            <strong className="font-num text-[#D4AF37]">
              {trade.tp1Hit
                ? lang === "ar"
                  ? "تحقق ✓"
                  : "Hit ✓"
                : `${trade.remainingToTp1Pct.toFixed(2)}%`}
            </strong>
          </span>
          <span className="font-num text-[#64748B]">
            Qty: {trade.quantity >= 1 ? trade.quantity.toFixed(3) : trade.quantity.toFixed(6)}
          </span>
        </div>
        <div dir="ltr" className="relative h-2 rounded-full bg-[#121A2D]">
          <div
            className="absolute top-0 bottom-0 left-0 rounded-l-full bg-[#EF4444]/35"
            style={{ width: `${pos(trade.entryPrice)}%` }}
          />
          <div
            className="absolute top-0 bottom-0 rounded-r-full bg-[#10B981]/25"
            style={{ left: `${pos(trade.entryPrice)}%`, right: 0 }}
          />
          <div
            className="absolute top-[-2px] w-1 h-3 bg-[#D4AF37]"
            style={{ left: `calc(${pos(trade.entryPrice)}% - 2px)` }}
          />
          <div
            className="absolute top-[-3px] w-3.5 h-3.5 rounded-full bg-[#F8FAFC] border-2 border-[#10B981]"
            style={{ left: `calc(${pos(trade.livePrice)}% - 7px)` }}
          />
        </div>
      </div>

      {/* Individual TP Progress Bars */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "TP1", val: trade.tp1Hit ? 100 : tpProgress(trade.tp1), hit: trade.tp1Hit },
          { label: "TP2", val: trade.tp2Hit ? 100 : tpProgress(trade.tp2), hit: trade.tp2Hit },
          { label: "TP3", val: trade.tp3Hit ? 100 : tpProgress(trade.tp3), hit: trade.tp3Hit },
        ].map((item) => (
          <div key={item.label} className="space-y-1">
            <div className="flex justify-between text-[10px] font-num">
              <span className={item.hit ? "text-[#10B981] font-bold" : "text-[#94A3B8]"}>
                {item.label} {item.hit ? "✓" : ""}
              </span>
              <span className="text-[#CBD5E1]">{item.val.toFixed(0)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-[#121A2D] overflow-hidden">
              <div
                className="h-full bg-[#10B981] transition-all"
                style={{ width: `${item.val}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Edit Form */}
      {editing && isOpen && (
        <div className="rounded-lg border border-[#D4AF37]/40 bg-[#070B14] p-3 space-y-2">
          <div className="text-xs font-bold text-[#D4AF37]">
            {lang === "ar"
              ? "تعديل الوقف والأهداف (الدخول مجمّد لا يتغير)"
              : "Adjust SL/TP (Frozen entry never changes)"}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <input
              type="number"
              step="any"
              value={slInput}
              onChange={(e) => setSlInput(e.target.value)}
              placeholder="SL"
              className="rounded bg-[#0D1322] border border-[#1E293B] px-2 py-1 font-num text-[#F8FAFC]"
            />
            <input
              type="number"
              step="any"
              value={tp1Input}
              onChange={(e) => setTp1Input(e.target.value)}
              placeholder="TP1"
              className="rounded bg-[#0D1322] border border-[#1E293B] px-2 py-1 font-num text-[#F8FAFC]"
            />
            <input
              type="number"
              step="any"
              value={tp2Input}
              onChange={(e) => setTp2Input(e.target.value)}
              placeholder="TP2"
              className="rounded bg-[#0D1322] border border-[#1E293B] px-2 py-1 font-num text-[#F8FAFC]"
            />
            <input
              type="number"
              step="any"
              value={tp3Input}
              onChange={(e) => setTp3Input(e.target.value)}
              placeholder="TP3"
              className="rounded bg-[#0D1322] border border-[#1E293B] px-2 py-1 font-num text-[#F8FAFC]"
            />
          </div>
          {err && <div className="text-[11px] text-[#EF4444]">{err}</div>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 px-3 py-1 rounded bg-[#D4AF37] text-[#070B14] text-xs font-bold cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" /> {lang === "ar" ? "حفظ" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#1A2338] text-[#94A3B8] text-xs cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> {lang === "ar" ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#1A2338]">
        <span className="text-[11px] text-[#64748B]">
          {lang === "ar" ? "تاريخ الفتح:" : "Opened:"} {fmtDateTime(trade.openedAt, lang)}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onAnalyze(trade.symbol, trade.exchange, trade.primaryTimeframe)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#121A2D] hover:bg-[#1A243C] border border-[#1E293B] text-xs text-[#E2E8F0] cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#D4AF37]" />
            <span>{lang === "ar" ? "الشارت" : "Chart"}</span>
          </button>
          {isOpen && (
            <>
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#121A2D] hover:bg-[#1A243C] border border-[#1E293B] text-xs text-[#CBD5E1] cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{lang === "ar" ? "تعديل" : "Edit"}</span>
              </button>
              <button
                type="button"
                disabled={closing}
                onClick={handleClose}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#EF4444]/15 hover:bg-[#EF4444]/25 border border-[#EF4444]/40 text-xs font-bold text-[#EF4444] cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                <span>
                  {closing
                    ? lang === "ar"
                      ? "إغلاق..."
                      : "Closing..."
                    : lang === "ar"
                      ? "إغلاق الصفقة"
                      : "Close Trade"}
                </span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
