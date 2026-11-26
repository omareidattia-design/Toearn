import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, notifications, SignalReason, signals, tradeEvents, trades } from "@/db";
import { getExchangeTickers } from "@/lib/exchanges";
import { formatPriceCompact } from "@/lib/smc-engine";
import { ExchangeId, STRATEGY_RULES } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Activates a tracked Spot Long trade (strictly 100 USDT, monitoring only — NO exchange order execution, NO API keys!).
 * Enforces NO DUPLICATE OPEN TRADE on (symbol, exchange) in both server logic AND PostgreSQL unique partial index.
 * Freezes entryPrice permanently once opened.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    let symbol: string;
    let baseAsset: string;
    let exchange: ExchangeId;
    let marketType: string;
    let sector: string;
    let primaryTimeframe: string;
    let qualifiedTimeframes: string[];
    let originalScore: number;
    let entryPrice: number;
    let stopLoss: number;
    let tp1: number;
    let tp2: number;
    let tp3: number;
    let reasons: SignalReason[];
    let signalId: number | null = null;

    if (body.signalId) {
      const sigRows = await db
        .select()
        .from(signals)
        .where(eq(signals.id, Number(body.signalId)))
        .limit(1);

      if (sigRows.length === 0) {
        return NextResponse.json({ error: "الإشارة غير موجودة" }, { status: 404 });
      }
      const sig = sigRows[0];
      if (sig.status === "EXPIRED") {
        return NextResponse.json(
          { error: "انتهت صلاحية هذه الإشارة — لا يمكن تفعيل إشارة منتهية" },
          { status: 400 }
        );
      }

      signalId = sig.id;
      symbol = sig.symbol;
      baseAsset = sig.baseAsset;
      exchange = sig.exchange as ExchangeId;
      marketType = sig.marketType;
      sector = sig.sector;
      primaryTimeframe = sig.primaryTimeframe;
      qualifiedTimeframes = sig.qualifiedTimeframes;
      originalScore = sig.score;
      entryPrice = sig.entryPrice;
      stopLoss = Number(body.stopLoss ?? sig.stopLoss);
      tp1 = Number(body.tp1 ?? sig.tp1);
      tp2 = Number(body.tp2 ?? sig.tp2);
      tp3 = Number(body.tp3 ?? sig.tp3);
      reasons = sig.reasons;
    } else {
      // Activation directly from an analyzed qualified setup
      symbol = String(body.symbol || "").toUpperCase();
      exchange = body.exchange === "MEXC" ? "MEXC" : "BINANCE";
      baseAsset = String(body.baseAsset || symbol.replace(/USDT$/, ""));
      marketType = body.marketType === "STOCK" ? "STOCK" : "CRYPTO";
      sector = String(body.sector || "أخرى");
      primaryTimeframe = String(body.primaryTimeframe || "4h");
      qualifiedTimeframes = Array.isArray(body.qualifiedTimeframes)
        ? body.qualifiedTimeframes
        : [primaryTimeframe];
      originalScore = Number(body.score || 0);
      entryPrice = Number(body.entryPrice || 0);
      stopLoss = Number(body.stopLoss || 0);
      tp1 = Number(body.tp1 || 0);
      tp2 = Number(body.tp2 || 0);
      tp3 = Number(body.tp3 || 0);
      reasons = Array.isArray(body.reasons) ? body.reasons : [];

      if (originalScore < STRATEGY_RULES.SCORE_THRESHOLD) {
        return NextResponse.json(
          { error: "لا يمكن تفعيل صفقة لعملة غير مؤهلة (أقل من حد 58/100)" },
          { status: 400 }
        );
      }
    }

    if (!symbol || !(stopLoss > 0 && stopLoss < entryPrice && tp1 > entryPrice && tp2 > tp1 && tp3 > tp2)) {
      return NextResponse.json(
        { error: "بيانات مستويات الدخول والوقف والأهداف غير صالحة" },
        { status: 400 }
      );
    }

    const tp1PctCheck = ((tp1 - entryPrice) / entryPrice) * 100;
    if (tp1PctCheck < STRATEGY_RULES.MIN_PROFIT_PCT) {
      return NextResponse.json(
        { error: "مرفوض: ربح الهدف الأول TP1 أقل من الحد الأدنى المطلوب 2%" },
        { status: 400 }
      );
    }

    // SERVER-SIDE CHECK: Block duplicate OPEN trade on same coin + exchange!
    const existingOpen = await db
      .select({ id: trades.id, entryPrice: trades.entryPrice })
      .from(trades)
      .where(
        and(
          eq(trades.symbol, symbol),
          eq(trades.exchange, exchange),
          eq(trades.status, "OPEN")
        )
      )
      .limit(1);

    if (existingOpen.length > 0) {
      return NextResponse.json(
        {
          error: `توجد صفقة مفتوحة بالفعل على ${symbol} (${exchange}) بسعر دخول مجمّد ${formatPriceCompact(existingOpen[0].entryPrice)} — ممنوع تكرار الصفقة على نفس العملة!`,
          code: "DUPLICATE_OPEN_TRADE",
        },
        { status: 409 }
      );
    }

    // Use live ticker for initial lastPrice; entryPrice is FROZEN at activation
    const tickers = await getExchangeTickers(exchange);
    const livePrice = tickers.get(symbol)?.lastPrice ?? entryPrice;

    const tradeSizeUsdt = STRATEGY_RULES.TRADE_SIZE_USDT; // STRICTLY 100 USDT
    const quantity = tradeSizeUsdt / entryPrice;
    const estimatedFeesUsdt =
      tradeSizeUsdt * (STRATEGY_RULES.TOTAL_COST_PCT / 100);
    const grossPnl = (livePrice - entryPrice) * quantity;
    const netPnl = grossPnl - estimatedFeesUsdt;
    const netPnlPct = (netPnl / tradeSizeUsdt) * 100;

    let createdTrade;
    try {
      const [inserted] = await db
        .insert(trades)
        .values({
          signalId,
          symbol,
          baseAsset,
          exchange,
          marketType,
          sector,
          status: "OPEN",
          primaryTimeframe,
          qualifiedTimeframes,
          originalScore,
          entryPrice, // IMMUTABLE FROZEN ENTRY PRICE
          stopLoss,
          tp1,
          tp2,
          tp3,
          tradeSizeUsdt,
          quantity,
          estimatedFeesUsdt,
          reasons,
          lastPrice: livePrice,
          unrealizedPnlUsdt: netPnl,
          unrealizedPnlPercent: netPnlPct,
        })
        .returning();
      createdTrade = inserted;
    } catch (dbErr) {
      // POSTGRESQL UNIQUE PARTIAL INDEX ENFORCEMENT BACKSTOP!
      const msg = (dbErr as Error).message || "";
      if (msg.includes("trades_open_symbol_exchange_uidx") || msg.includes("duplicate")) {
        return NextResponse.json(
          {
            error: `منع قاعدة البيانات: توجد صفقة مفتوحة بالفعل على ${symbol} (${exchange})`,
            code: "DUPLICATE_OPEN_TRADE_DB",
          },
          { status: 409 }
        );
      }
      throw dbErr;
    }

    if (signalId) {
      await db
        .update(signals)
        .set({ status: "ACTIVATED", updatedAt: new Date() })
        .where(eq(signals.id, signalId));
    }

    await db.insert(tradeEvents).values({
      tradeId: createdTrade.id,
      eventType: "OPENED",
      price: entryPrice,
      pnlUsdt: -estimatedFeesUsdt,
      messageAr: `تم تفعيل تتبّع صفقة Spot شراء على ${symbol} (${exchange}) بقيمة ثابتة 100 USDT وسعر دخول مجمّد ${formatPriceCompact(entryPrice)} (الكمية: ${quantity.toFixed(6)}).`,
      messageEn: `Activated Spot Long tracking on ${symbol} (${exchange}) — fixed 100 USDT, frozen entry ${formatPriceCompact(entryPrice)} (Qty: ${quantity.toFixed(6)}).`,
    });

    await db.insert(notifications).values({
      type: "TRADE_OPENED",
      symbol,
      exchange,
      titleAr: `تفعيل تتبّع صفقة — ${symbol}`,
      titleEn: `Trade Tracking Activated — ${symbol}`,
      bodyAr: `صفقة Spot بقيمة 100 USDT على ${symbol} (${exchange}) · الدخول المجمّد ${formatPriceCompact(entryPrice)} · الوقف ${formatPriceCompact(stopLoss)} · TP1 ${formatPriceCompact(tp1)} · الفريم ${primaryTimeframe}.`,
      bodyEn: `100 USDT Spot tracking on ${symbol} (${exchange}) · Frozen Entry ${formatPriceCompact(entryPrice)} · SL ${formatPriceCompact(stopLoss)} · TP1 ${formatPriceCompact(tp1)} · TF ${primaryTimeframe}.`,
      metadata: {
        tradeId: createdTrade.id,
        entryPrice,
        stopLoss,
        tp1,
        tp2,
        tp3,
        timeframe: primaryTimeframe,
        reasons,
      },
    });

    return NextResponse.json({ trade: createdTrade }, { status: 201 });
  } catch (err) {
    console.error("[API /trades/activate] error:", err);
    return NextResponse.json(
      { error: (err as Error).message || "Failed to activate trade" },
      { status: 500 }
    );
  }
}
