import { and, desc, eq, lte, sql } from "drizzle-orm";
import {
  db,
  favorites,
  notifications,
  ScanCandidate,
  scanJobs,
  settings,
  signals,
  tradeEvents,
  trades,
} from "@/db";
import {
  getAllDiscoveredPairs,
  getExchangeTickers,
  getKlines,
  getMarketContext,
} from "./exchanges";
import { analyzeSmcBottomHunt, formatPriceCompact } from "./smc-engine";
import { queueAutomaticTelegramSignal } from "./telegram";
import {
  ALL_TIMEFRAMES,
  Candle,
  DiscoveredPair,
  ExchangeId,
  SmcAnalysisResult,
  STRATEGY_RULES,
  Ticker24h,
  Timeframe,
  TIMEFRAME_RANK,
} from "./types";

const g = globalThis as typeof globalThis & {
  __qannasActiveScanJobId?: number | null;
  __qannasStopRequestedIds?: Set<number>;
};

if (!g.__qannasStopRequestedIds) {
  g.__qannasStopRequestedIds = new Set<number>();
}

export async function getOrCreateSettings() {
  const existing = await db
    .select()
    .from(settings)
    .where(eq(settings.id, "default"))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [created] = await db
    .insert(settings)
    .values({
      id: "default",
      selectedTimeframes: [...ALL_TIMEFRAMES],
      timeframePreset: "all",
      entryMode: "B",
      autoScanEnabled: true,
      autoScanIntervalMinutes: 5,
      scoreThreshold: STRATEGY_RULES.SCORE_THRESHOLD,
      tradeSizeUsdt: STRATEGY_RULES.TRADE_SIZE_USDT,
      signalExpiryMinutes: STRATEGY_RULES.SIGNAL_EXPIRY_MINUTES,
      language: "ar",
      soundEnabled: true,
      browserNotifications: false,
    })
    .onConflictDoNothing()
    .returning();

  if (created) return created;
  const fallback = await db
    .select()
    .from(settings)
    .where(eq(settings.id, "default"))
    .limit(1);
  return fallback[0];
}

export async function expireOldSignals(): Promise<number> {
  const now = new Date();
  const expired = await db
    .update(signals)
    .set({ status: "EXPIRED", updatedAt: now })
    .where(and(eq(signals.status, "ACTIVE"), lte(signals.expiresAt, now)))
    .returning({ id: signals.id });
  return expired.length;
}

export async function monitorOpenTrades(): Promise<void> {
  await expireOldSignals();

  const openTrades = await db
    .select()
    .from(trades)
    .where(eq(trades.status, "OPEN"));

  if (openTrades.length === 0) return;

  const [binanceTickers, mexcTickers] = await Promise.all([
    getExchangeTickers("BINANCE"),
    getExchangeTickers("MEXC"),
  ]);

  const now = new Date();

  for (const t of openTrades) {
    const tickerMap = t.exchange === "BINANCE" ? binanceTickers : mexcTickers;
    const ticker = tickerMap.get(t.symbol);
    if (!ticker || ticker.lastPrice <= 0) continue;

    const livePrice = ticker.lastPrice;
    const grossPnl = (livePrice - t.entryPrice) * t.quantity;
    const netPnl = grossPnl - t.estimatedFeesUsdt;
    const netPnlPct = (netPnl / t.tradeSizeUsdt) * 100;

    // Check Stop Loss hit first
    if (livePrice <= t.stopLoss) {
      await db
        .update(trades)
        .set({
          status: "CLOSED_SL",
          lastPrice: livePrice,
          closePrice: livePrice,
          closeReason: "SL_HIT",
          unrealizedPnlUsdt: 0,
          unrealizedPnlPercent: 0,
          realizedPnlUsdt: netPnl,
          realizedPnlPercent: netPnlPct,
          closedAt: now,
          updatedAt: now,
        })
        .where(eq(trades.id, t.id));

      await db.insert(tradeEvents).values({
        tradeId: t.id,
        eventType: "SL_HIT",
        price: livePrice,
        pnlUsdt: netPnl,
        messageAr: `تم ضرب وقف الخسارة عند ${formatPriceCompact(livePrice)} وإغلاق الصفقة تلقائيًا (${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} USDT)`,
        messageEn: `Stop Loss hit at ${formatPriceCompact(livePrice)} — trade auto-closed (${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} USDT)`,
      });

      await db.insert(notifications).values({
        type: "SL_HIT",
        symbol: t.symbol,
        exchange: t.exchange,
        titleAr: `ضرب وقف الخسارة — ${t.symbol}`,
        titleEn: `Stop Loss Hit — ${t.symbol}`,
        bodyAr: `وصل سعر ${t.symbol} (${t.exchange}) إلى ${formatPriceCompact(livePrice)} (وقف ${formatPriceCompact(t.stopLoss)}) · صافي النتيجة ${netPnl.toFixed(2)} USDT.`,
        bodyEn: `${t.symbol} (${t.exchange}) reached ${formatPriceCompact(livePrice)} (SL ${formatPriceCompact(t.stopLoss)}) · Net PnL ${netPnl.toFixed(2)} USDT.`,
        metadata: {
          tradeId: t.id,
          price: livePrice,
          stopLoss: t.stopLoss,
          pnlUsdt: netPnl,
          timeframe: t.primaryTimeframe,
        },
      });
      continue;
    }

    let tp1Hit = t.tp1Hit;
    let tp2Hit = t.tp2Hit;
    let tp3Hit = t.tp3Hit;
    const eventsToLog: Array<{
      eventType: string;
      msgAr: string;
      msgEn: string;
      notifTitleAr: string;
      notifTitleEn: string;
    }> = [];

    if (!tp1Hit && livePrice >= t.tp1) {
      tp1Hit = true;
      eventsToLog.push({
        eventType: "TP1_HIT",
        msgAr: `تحقق الهدف الأول TP1 عند ${formatPriceCompact(livePrice)} (+${(((livePrice - t.entryPrice) / t.entryPrice) * 100).toFixed(2)}%)`,
        msgEn: `Target 1 (TP1) hit at ${formatPriceCompact(livePrice)} (+${(((livePrice - t.entryPrice) / t.entryPrice) * 100).toFixed(2)}%)`,
        notifTitleAr: `تحقق TP1 — ${t.symbol}`,
        notifTitleEn: `TP1 Reached — ${t.symbol}`,
      });
    }
    if (!tp2Hit && livePrice >= t.tp2) {
      tp2Hit = true;
      eventsToLog.push({
        eventType: "TP2_HIT",
        msgAr: `تحقق الهدف الثاني TP2 عند ${formatPriceCompact(livePrice)} (+${(((livePrice - t.entryPrice) / t.entryPrice) * 100).toFixed(2)}%)`,
        msgEn: `Target 2 (TP2) hit at ${formatPriceCompact(livePrice)} (+${(((livePrice - t.entryPrice) / t.entryPrice) * 100).toFixed(2)}%)`,
        notifTitleAr: `تحقق TP2 — ${t.symbol}`,
        notifTitleEn: `TP2 Reached — ${t.symbol}`,
      });
    }
    if (!tp3Hit && livePrice >= t.tp3) {
      tp3Hit = true;
      eventsToLog.push({
        eventType: "TP3_HIT",
        msgAr: `تحقق الهدف الثالث TP3 عند ${formatPriceCompact(livePrice)} وإغلاق الصفقة بربح +${netPnl.toFixed(2)} USDT`,
        msgEn: `Target 3 (TP3) hit at ${formatPriceCompact(livePrice)} — trade completed with +${netPnl.toFixed(2)} USDT`,
        notifTitleAr: `تحقق TP3 واكتملت الصفقة — ${t.symbol}`,
        notifTitleEn: `TP3 Reached & Completed — ${t.symbol}`,
      });
    }

    if (tp3Hit) {
      await db
        .update(trades)
        .set({
          status: "CLOSED_TP3",
          tp1Hit: true,
          tp2Hit: true,
          tp3Hit: true,
          lastPrice: livePrice,
          closePrice: livePrice,
          closeReason: "TP3_HIT",
          unrealizedPnlUsdt: 0,
          unrealizedPnlPercent: 0,
          realizedPnlUsdt: netPnl,
          realizedPnlPercent: netPnlPct,
          closedAt: now,
          updatedAt: now,
        })
        .where(eq(trades.id, t.id));
    } else {
      await db
        .update(trades)
        .set({
          tp1Hit,
          tp2Hit,
          tp3Hit,
          lastPrice: livePrice,
          unrealizedPnlUsdt: netPnl,
          unrealizedPnlPercent: netPnlPct,
          updatedAt: now,
        })
        .where(eq(trades.id, t.id));
    }

    for (const ev of eventsToLog) {
      await db.insert(tradeEvents).values({
        tradeId: t.id,
        eventType: ev.eventType,
        price: livePrice,
        pnlUsdt: netPnl,
        messageAr: ev.msgAr,
        messageEn: ev.msgEn,
      });
      await db.insert(notifications).values({
        type: "TP_HIT",
        symbol: t.symbol,
        exchange: t.exchange,
        titleAr: ev.notifTitleAr,
        titleEn: ev.notifTitleEn,
        bodyAr: `${ev.msgAr} · الفريم ${t.primaryTimeframe} · صافي الربح الحي ${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} USDT.`,
        bodyEn: `${ev.msgEn} · Timeframe ${t.primaryTimeframe} · Net PnL ${netPnl >= 0 ? "+" : ""}${netPnl.toFixed(2)} USDT.`,
        metadata: {
          tradeId: t.id,
          eventType: ev.eventType,
          price: livePrice,
          pnlUsdt: netPnl,
          timeframe: t.primaryTimeframe,
        },
      });
    }
  }
}

export async function startScanJob(options?: {
  trigger?: "MANUAL" | "AUTO";
  timeframes?: Timeframe[];
  exchangeFilter?: "ALL" | "BINANCE" | "MEXC";
}) {
  const cfg = await getOrCreateSettings();

  // Check if a RUNNING job is already executing
  const runningJobs = await db
    .select()
    .from(scanJobs)
    .where(eq(scanJobs.status, "RUNNING"))
    .orderBy(desc(scanJobs.id))
    .limit(1);

  if (runningJobs.length > 0 && g.__qannasActiveScanJobId === runningJobs[0].id) {
    return { job: runningJobs[0], alreadyRunning: true };
  }

  // If stale RUNNING job exists from before server restart, resume it ONLY if trigger is resume, otherwise mark or reuse
  const timeframes: Timeframe[] =
    options?.timeframes && options.timeframes.length > 0
      ? options.timeframes.filter((tf): tf is Timeframe =>
          ALL_TIMEFRAMES.includes(tf)
        )
      : (cfg.selectedTimeframes as Timeframe[]).length > 0
        ? (cfg.selectedTimeframes as Timeframe[])
        : [...ALL_TIMEFRAMES];

  const exchangeFilter = options?.exchangeFilter ?? "ALL";
  const trigger = options?.trigger ?? "MANUAL";

  // Discover ALL live Spot USDT pairs from Binance & MEXC (ZERO EXCLUSIONS!)
  const { pairs, statuses } = await getAllDiscoveredPairs(false);

  const filteredByExchange =
    exchangeFilter === "ALL"
      ? pairs
      : pairs.filter((p) => p.exchange === exchangeFilter);

  // Fetch live tickers to order highest-volume pairs first (still scanning 100% of pairs!)
  const [binanceTickers, mexcTickers] = await Promise.all([
    exchangeFilter === "MEXC" ? Promise.resolve(new Map<string, Ticker24h>()) : getExchangeTickers("BINANCE"),
    exchangeFilter === "BINANCE" ? Promise.resolve(new Map<string, Ticker24h>()) : getExchangeTickers("MEXC"),
  ]);

  const sortedPairs = [...filteredByExchange].sort((a, b) => {
    const tA = (a.exchange === "BINANCE" ? binanceTickers : mexcTickers).get(a.symbol);
    const tB = (b.exchange === "BINANCE" ? binanceTickers : mexcTickers).get(b.symbol);
    return (tB?.quoteVolume ?? 0) - (tA?.quoteVolume ?? 0);
  });

  const frozenCandidates: ScanCandidate[] = sortedPairs.map((p) => ({
    symbol: p.symbol,
    baseAsset: p.baseAsset,
    exchange: p.exchange,
    marketType: p.marketType,
    sector: p.sector,
    fullName: p.fullName,
  }));

  const [job] = await db
    .insert(scanJobs)
    .values({
      status: "RUNNING",
      trigger,
      timeframes,
      exchangeFilter,
      candidates: frozenCandidates,
      cursor: 0,
      discoveredCount: frozenCandidates.length,
      binanceDiscovered: statuses.BINANCE.pairCount,
      mexcDiscovered: statuses.MEXC.pairCount,
      scannedCount: 0,
      qualifiedCount: 0,
      failedCount: 0,
      excludedCount: 0, // ALWAYS ZERO!
      rejectionSummary: {},
    })
    .returning();

  // Launch background execution loop without blocking HTTP response
  void processScanJobLoop(job.id);

  return { job, alreadyRunning: false };
}

export async function stopActiveScanJobs(): Promise<{ stoppedCount: number; jobId: number | null }> {
  const running = await db
    .select()
    .from(scanJobs)
    .where(eq(scanJobs.status, "RUNNING"))
    .orderBy(desc(scanJobs.id));

  if (running.length === 0) {
    g.__qannasActiveScanJobId = null;
    return { stoppedCount: 0, jobId: null };
  }

  const now = new Date();
  for (const job of running) {
    g.__qannasStopRequestedIds?.add(job.id);
    await db
      .update(scanJobs)
      .set({
        status: "STOPPED",
        finishedAt: now,
        updatedAt: now,
      })
      .where(eq(scanJobs.id, job.id));

    await db.insert(notifications).values({
      type: "SCAN_STOPPED",
      titleAr: "تم إيقاف الفحص من الخادم",
      titleEn: "Market Scan Stopped on Server",
      bodyAr: `توقف الفحص رقم #${job.id} بعد فحص ${job.scannedCount} من ${job.discoveredCount} زوجًا (${job.qualifiedCount} فرصة مؤهلة محفوظة). الفحص التلقائي لن يستكمل المهمة الموقوفة.`,
      bodyEn: `Scan #${job.id} stopped after scanning ${job.scannedCount}/${job.discoveredCount} pairs (${job.qualifiedCount} qualified setups preserved).`,
      metadata: {
        jobId: job.id,
        scannedCount: job.scannedCount,
        discoveredCount: job.discoveredCount,
        qualifiedCount: job.qualifiedCount,
      },
    });
  }

  g.__qannasActiveScanJobId = null;
  return { stoppedCount: running.length, jobId: running[0].id };
}

export async function resumeInterruptedScanIfAny(): Promise<void> {
  if (g.__qannasActiveScanJobId) return;
  const running = await db
    .select()
    .from(scanJobs)
    .where(eq(scanJobs.status, "RUNNING"))
    .orderBy(desc(scanJobs.id))
    .limit(1);

  if (running.length > 0) {
    const job = running[0];
    if (!g.__qannasStopRequestedIds?.has(job.id)) {
      console.log(`[QANNAS] Resuming interrupted scan job #${job.id} from cursor ${job.cursor}/${job.discoveredCount}`);
      void processScanJobLoop(job.id);
    }
  }
}

async function isJobStopped(jobId: number): Promise<boolean> {
  if (g.__qannasStopRequestedIds?.has(jobId)) return true;
  const rows = await db
    .select({ status: scanJobs.status })
    .from(scanJobs)
    .where(eq(scanJobs.id, jobId))
    .limit(1);
  return rows.length === 0 || rows[0].status !== "RUNNING";
}

async function processScanJobLoop(jobId: number): Promise<void> {
  g.__qannasActiveScanJobId = jobId;

  try {
    await expireOldSignals();

    const rows = await db
      .select()
      .from(scanJobs)
      .where(eq(scanJobs.id, jobId))
      .limit(1);
    if (rows.length === 0) return;

    const job = rows[0];
    if (job.status !== "RUNNING") return;

    const candidates = job.candidates;
    const timeframes = (job.timeframes as Timeframe[]).length
      ? (job.timeframes as Timeframe[])
      : [...ALL_TIMEFRAMES];

    const cfg = await getOrCreateSettings();
    const expiryMinutes = cfg.signalExpiryMinutes || STRATEGY_RULES.SIGNAL_EXPIRY_MINUTES;
    const entryMode = cfg.entryMode === "A" ? "A" : "B";

    const [binanceTickers, mexcTickers, btcContext] = await Promise.all([
      getExchangeTickers("BINANCE"),
      getExchangeTickers("MEXC"),
      getMarketContext(),
    ]);

    // Load favorites & currently open trades / active signals to prevent duplicates
    const favRows = await db.select().from(favorites);
    const favSet = new Set(favRows.map((f) => `${f.exchange}:${f.symbol}`));

    let cursor = job.cursor;
    let scannedCount = job.scannedCount;
    let qualifiedCount = job.qualifiedCount;
    let failedCount = job.failedCount;
    const rejectionSummary: Record<string, number> = { ...(job.rejectionSummary || {}) };

    const BATCH_SIZE = 6;

    while (cursor < candidates.length) {
      // Check server-side STOP before EVERY slice!
      if (await isJobStopped(jobId)) {
        return;
      }

      const slice = candidates.slice(cursor, cursor + BATCH_SIZE);

      // Process slice concurrently with controlled parallelism
      const sliceResults = await Promise.all(
        slice.map(async (cand) => {
          try {
            const ticker =
              (cand.exchange === "BINANCE" ? binanceTickers : mexcTickers).get(
                cand.symbol
              ) ?? null;

            // Evaluate hard ticker quality gates FIRST so we still count every coin as SCANNED & REJECTED (never excluded!)
            if (!ticker || ticker.lastPrice <= 0) {
              return { status: "REJECTED" as const, codes: ["INSUFFICIENT_CANDLES"] };
            }
            if (ticker.quoteVolume < STRATEGY_RULES.MIN_VOLUME_24H_USDT) {
              return { status: "REJECTED" as const, codes: ["LOW_LIQUIDITY_24H"] };
            }
            if (ticker.spreadPct > STRATEGY_RULES.MAX_SPREAD_PCT) {
              return { status: "REJECTED" as const, codes: ["HIGH_SPREAD"] };
            }

            // Fetch HTF 1d & 4h candles once per coin
            const [d1Candles, h4Candles] = await Promise.all([
              getKlines(cand.exchange, cand.symbol, "1d", 100),
              getKlines(cand.exchange, cand.symbol, "4h", 120),
            ]);

            const pairObj: DiscoveredPair = {
              symbol: cand.symbol,
              baseAsset: cand.baseAsset,
              quoteAsset: "USDT",
              exchange: cand.exchange,
              marketType: cand.marketType,
              sector: cand.sector,
              fullName: cand.fullName,
            };

            // Quick HTF check on 4h first — if HTF is strictly bearish, skip fetching lower TFs
            const h4Check = analyzeSmcBottomHunt({
              pair: pairObj,
              timeframe: "4h",
              entryCandles: h4Candles,
              dailyCandles: d1Candles,
              h4Candles,
              ticker,
              btcContext,
              entryMode,
            });

            if (h4Check.steps[0].status === "FAIL") {
              return {
                status: "REJECTED" as const,
                codes: ["HTF_BIAS_BEARISH"],
              };
            }

            // HTF passed! Now evaluate ALL selected timeframes
            const tfCache: Partial<Record<Timeframe, Candle[]>> = {
              "1d": d1Candles,
              "4h": h4Candles,
            };

            const toFetch = timeframes.filter((tf) => tf !== "1d" && tf !== "4h");
            if (toFetch.length > 0) {
              const fetched = await Promise.allSettled(
                toFetch.map(async (tf) => ({
                  tf,
                  candles: await getKlines(cand.exchange, cand.symbol, tf, 120),
                }))
              );
              for (const r of fetched) {
                if (r.status === "fulfilled") {
                  tfCache[r.value.tf] = r.value.candles;
                }
              }
            }

            const qualifiedAnalyses: SmcAnalysisResult[] = [];
            const rejectedCodes = new Set<string>();

            for (const tf of timeframes) {
              const c = tfCache[tf];
              if (!c || c.length < 35) {
                rejectedCodes.add("INSUFFICIENT_CANDLES");
                continue;
              }
              const res =
                tf === "4h" && Object.keys(tfCache).length <= 2
                  ? h4Check
                  : analyzeSmcBottomHunt({
                      pair: pairObj,
                      timeframe: tf,
                      entryCandles: c,
                      dailyCandles: d1Candles,
                      h4Candles,
                      ticker,
                      btcContext,
                      entryMode,
                      allTfCandles: tfCache,
                    });

              if (res.qualified && res.tradePlan) {
                qualifiedAnalyses.push(res);
              } else {
                for (const rr of res.rejectionReasons) {
                  rejectedCodes.add(rr.code);
                }
              }
            }

            if (qualifiedAnalyses.length > 0) {
              // Pick BEST setup: highest score; on tie, highest timeframe!
              qualifiedAnalyses.sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return TIMEFRAME_RANK[b.timeframe] - TIMEFRAME_RANK[a.timeframe];
              });

              const best = qualifiedAnalyses[0];
              const qualifiedTfs = qualifiedAnalyses
                .map((q) => q.timeframe)
                .sort((a, b) => TIMEFRAME_RANK[b] - TIMEFRAME_RANK[a]);

              return {
                status: "QUALIFIED" as const,
                best,
                qualifiedTfs,
              };
            }

            return {
              status: "REJECTED" as const,
              codes: Array.from(rejectedCodes).slice(0, 3),
            };
          } catch (err) {
            return {
              status: "FAILED" as const,
              error: (err as Error).message,
            };
          }
        })
      );

      // Re-check STOP before persisting results of this slice
      if (await isJobStopped(jobId)) {
        return;
      }

      for (const r of sliceResults) {
        scannedCount++;
        if (r.status === "FAILED") {
          failedCount++;
        } else if (r.status === "REJECTED") {
          for (const code of r.codes) {
            rejectionSummary[code] = (rejectionSummary[code] || 0) + 1;
          }
        } else if (r.status === "QUALIFIED") {
          const { best, qualifiedTfs } = r;
          const saved = await persistQualifiedSignal({
            jobId,
            analysis: best,
            qualifiedTfs,
            expiryMinutes,
            isFavorite: favSet.has(`${best.exchange}:${best.symbol}`),
          });
          if (saved) {
            qualifiedCount++;
          }
        }
      }

      cursor += slice.length;

      // Save progress after EVERY slice for true resumability!
      await db
        .update(scanJobs)
        .set({
          cursor,
          scannedCount,
          qualifiedCount,
          failedCount,
          excludedCount: 0,
          rejectionSummary,
          updatedAt: new Date(),
        })
        .where(and(eq(scanJobs.id, jobId), eq(scanJobs.status, "RUNNING")));

      // Polite throttle between slices to stay well inside Binance/MEXC public rate limits
      await new Promise((resolve) => setTimeout(resolve, 220));
    }

    // Final check before marking DONE: ONLY mark DONE if scannedCount === discoveredCount!
    if (await isJobStopped(jobId)) return;

    const now = new Date();
    const isComplete = scannedCount >= candidates.length;
    await db
      .update(scanJobs)
      .set({
        status: isComplete ? "DONE" : "STOPPED",
        cursor: candidates.length,
        scannedCount,
        qualifiedCount,
        failedCount,
        excludedCount: 0,
        rejectionSummary,
        finishedAt: now,
        updatedAt: now,
      })
      .where(and(eq(scanJobs.id, jobId), eq(scanJobs.status, "RUNNING")));

    await db.insert(notifications).values({
      type: "SCAN_DONE",
      titleAr:
        qualifiedCount > 0
          ? `اكتمل الفحص الشامل — ${qualifiedCount} صفقة مؤهلة`
          : "اكتمل الفحص الشامل — لا توجد صفقات مؤهلة الآن",
      titleEn:
        qualifiedCount > 0
          ? `Full Scan Complete — ${qualifiedCount} Qualified Setups`
          : "Full Scan Complete — NO VALID TRADE SETUPS FOUND",
      bodyAr: `تم فحص ${scannedCount} من ${candidates.length} زوج Spot حي في Binance وMEXC (المستبعد: 0) · المؤهل: ${qualifiedCount} · الفاشل تقنيًا: ${failedCount}.`,
      bodyEn: `Scanned ${scannedCount}/${candidates.length} live Spot pairs across Binance & MEXC (Excluded: 0) · Qualified: ${qualifiedCount} · Failed: ${failedCount}.`,
      metadata: {
        jobId,
        scannedCount,
        discoveredCount: candidates.length,
        qualifiedCount,
        failedCount,
      },
    });
  } catch (err) {
    console.error(`[QANNAS] Scan job #${jobId} failed:`, err);
    const now = new Date();
    await db
      .update(scanJobs)
      .set({
        status: "FAILED",
        errorMessage: (err as Error).message,
        finishedAt: now,
        updatedAt: now,
      })
      .where(eq(scanJobs.id, jobId));

    await db.insert(notifications).values({
      type: "SCAN_FAILED",
      titleAr: "تعذّر إكمال الفحص",
      titleEn: "Market Scan Failed",
      bodyAr: `توقف الفحص رقم #${jobId} بسبب خطأ: ${(err as Error).message}`,
      bodyEn: `Scan #${jobId} failed with error: ${(err as Error).message}`,
      metadata: { jobId, error: (err as Error).message },
    });
  } finally {
    if (g.__qannasActiveScanJobId === jobId) {
      g.__qannasActiveScanJobId = null;
    }
    g.__qannasStopRequestedIds?.delete(jobId);
  }
}

async function persistQualifiedSignal(params: {
  jobId: number;
  analysis: SmcAnalysisResult;
  qualifiedTfs: Timeframe[];
  expiryMinutes: number;
  isFavorite: boolean;
}): Promise<boolean> {
  const { jobId, analysis, qualifiedTfs, expiryMinutes, isFavorite } = params;
  const tp = analysis.tradePlan;
  if (!analysis.qualified || !tp || tp.tp1Percent < STRATEGY_RULES.MIN_PROFIT_PCT) return false;

  // RULE: NO DUPLICATE ENTRY if an OPEN trade exists on the same coin + exchange!
  const openTrade = await db
    .select({ id: trades.id })
    .from(trades)
    .where(
      and(
        eq(trades.symbol, analysis.symbol),
        eq(trades.exchange, analysis.exchange),
        eq(trades.status, "OPEN")
      )
    )
    .limit(1);

  if (openTrade.length > 0) {
    return false;
  }

  // RULE: NO DUPLICATE ACTIVE signal on the same coin + exchange (never overwrite live entry!)
  const existingSignal = await db
    .select({ id: signals.id })
    .from(signals)
    .where(
      and(
        eq(signals.symbol, analysis.symbol),
        eq(signals.exchange, analysis.exchange),
        eq(signals.status, "ACTIVE")
      )
    )
    .limit(1);

  if (existingSignal.length > 0) {
    return false;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + expiryMinutes * 60 * 1000);

  try {
    return await db.transaction(async (tx) => {
      const [running] = await tx.select({ id: scanJobs.id }).from(scanJobs)
        .where(and(eq(scanJobs.id, jobId), eq(scanJobs.status, "RUNNING"))).limit(1).for("share");
      if (!running) return false;
      const [inserted] = await tx
        .insert(signals)
        .values({
          scanJobId: jobId,
          symbol: analysis.symbol,
          baseAsset: analysis.baseAsset,
          exchange: analysis.exchange,
          marketType: analysis.marketType,
          sector: analysis.sector,
          strategyName: analysis.entryMode === "B" ? "SMC_ICT_BOTTOM_HUNT_STRICT" : "SMC_ICT_BOTTOM_HUNT",
          status: "ACTIVE",
          score: analysis.score,
          grade: analysis.grade === "NONE" ? "B" : analysis.grade,
          primaryTimeframe: analysis.timeframe,
          qualifiedTimeframes: qualifiedTfs,
          entryPrice: tp.entryPrice,
          currentPriceAtDiscovery: analysis.currentPrice,
          stopLoss: tp.stopLoss,
          tp1: tp.tp1,
          tp2: tp.tp2,
          tp3: tp.tp3,
          slPercent: tp.slPercent,
          tp1Percent: tp.tp1Percent,
          tp2Percent: tp.tp2Percent,
          tp3Percent: tp.tp3Percent,
          riskRewardTp2: tp.riskRewardTp2,
          riskLevel: tp.riskLevel,
          tradeSizeUsdt: STRATEGY_RULES.TRADE_SIZE_USDT,
          quantity: tp.quantity,
          estimatedFeesUsdt: tp.estimatedFeesUsdt,
          expectedProfitTp2Usdt: tp.expectedProfitTp2Usdt,
          potentialLossUsdt: tp.potentialLossUsdt,
          reasons: analysis.signalReasons,
          analysisSnapshot: {
            ...analysis,
            qualifiedTimeframes: qualifiedTfs,
          } as unknown as Record<string, unknown>,
          discoveredAt: now,
          expiresAt,
          updatedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      if (!inserted) return false;
      await queueAutomaticTelegramSignal(tx, inserted);

      // FAVORITE OPPORTUNITY NOTIFICATION — MUST include saved reasons, timeframe & confluent TFs!
      if (isFavorite) {
        const reasonsTextAr = analysis.signalReasons
          .map((r) => r.labelAr)
          .join(" + ");
        const reasonsTextEn = analysis.signalReasons
          .map((r) => r.labelEn)
          .join(" + ");
        const mtfTextAr =
          qualifiedTfs.length > 1
            ? `متوافقة على ${qualifiedTfs.length} فريمات (${qualifiedTfs.join(" · ")})`
            : `فريم واحد (${analysis.timeframe})`;
        const mtfTextEn =
          qualifiedTfs.length > 1
            ? `Multi-TF aligned (${qualifiedTfs.join(", ")})`
            : `Single TF (${analysis.timeframe})`;

        await tx.insert(notifications).values({
          type: "FAVORITE_SIGNAL",
          symbol: analysis.symbol,
          exchange: analysis.exchange,
          titleAr: `فرصة شراء على المفضلة — ${analysis.symbol} (${analysis.score}/100)`,
          titleEn: `Favorite Buy Setup — ${analysis.symbol} (${analysis.score}/100)`,
          bodyAr: `رُصد إعداد اصطياد قاع على ${analysis.symbol} (${analysis.exchange} Spot) · الفريم: ${analysis.timeframe} (${mtfTextAr}) · السبب: ${reasonsTextAr}.`,
          bodyEn: `Bottom-hunt setup detected on ${analysis.symbol} (${analysis.exchange} Spot) · TF: ${analysis.timeframe} (${mtfTextEn}) · Reasons: ${reasonsTextEn}.`,
          metadata: {
            signalId: inserted.id,
            score: analysis.score,
            primaryTimeframe: analysis.timeframe,
            qualifiedTimeframes: qualifiedTfs,
            reasons: analysis.signalReasons,
            entryPrice: tp.entryPrice,
            stopLoss: tp.stopLoss,
            tp1: tp.tp1,
            tp2: tp.tp2,
            tp3: tp.tp3,
          },
        });
      }

      return true;
    });
  } catch (err) {
    // Handle unique partial index race condition gracefully
    const msg = (err as Error).message || "";
    if (msg.includes("signals_active_symbol_exchange_uidx") || msg.includes("duplicate")) {
      return false;
    }
    throw err;
  }
}

export async function analyzeSingleSymbolLive(params: {
  symbol: string;
  exchange: ExchangeId;
  timeframe: Timeframe;
}): Promise<{ analysis: SmcAnalysisResult; candles: Candle[] }> {
  const { symbol, exchange, timeframe } = params;
  const [{ pairs }, tickers, btcContext, cfg] = await Promise.all([
    getAllDiscoveredPairs(false),
    getExchangeTickers(exchange),
    getMarketContext(),
    getOrCreateSettings(),
  ]);
  const entryMode = cfg.entryMode === "A" ? "A" : "B";

  const found = pairs.find(
    (p) => p.symbol === symbol.toUpperCase() && p.exchange === exchange
  );

  const pairObj: DiscoveredPair = found ?? {
    symbol: symbol.toUpperCase(),
    baseAsset: symbol.toUpperCase().replace(/USDT$/, ""),
    quoteAsset: "USDT",
    exchange,
    marketType: "CRYPTO",
    sector: "أخرى",
  };

  const ticker = tickers.get(pairObj.symbol) ?? null;

  // Fetch ALL 6 timeframes in parallel for complete confluence & indicator table!
  const settled = await Promise.allSettled(
    ALL_TIMEFRAMES.map(async (tf) => ({
      tf,
      candles: await getKlines(exchange, pairObj.symbol, tf, tf === timeframe ? 180 : 120),
    }))
  );

  const allTfCandles: Partial<Record<Timeframe, Candle[]>> = {};
  for (const r of settled) {
    if (r.status === "fulfilled") {
      allTfCandles[r.value.tf] = r.value.candles;
    }
  }

  const entryCandles = allTfCandles[timeframe] ?? [];
  const dailyCandles = allTfCandles["1d"] ?? entryCandles;
  const h4Candles = allTfCandles["4h"] ?? entryCandles;

  const analysis = analyzeSmcBottomHunt({
    pair: pairObj,
    timeframe,
    entryCandles,
    dailyCandles,
    h4Candles,
    ticker,
    btcContext,
    entryMode,
    allTfCandles,
  });

  // Also check which other timeframes qualify right now for MTF display
  const qualifiedTfs: Timeframe[] = [];
  for (const tf of ALL_TIMEFRAMES) {
    const c = allTfCandles[tf];
    if (!c || c.length < 35) continue;
    if (tf === timeframe) {
      if (analysis.qualified) qualifiedTfs.push(tf);
    } else {
      const other = analyzeSmcBottomHunt({
        pair: pairObj,
        timeframe: tf,
        entryCandles: c,
        dailyCandles,
        h4Candles,
        ticker,
        btcContext,
        entryMode,
      });
      if (other.qualified) qualifiedTfs.push(tf);
    }
  }

  analysis.qualifiedTimeframes = qualifiedTfs;
  return { analysis, candles: entryCandles };
}

export async function getLatestScanJobSummary() {
  const rows = await db
    .select({
      id: scanJobs.id,
      status: scanJobs.status,
      trigger: scanJobs.trigger,
      timeframes: scanJobs.timeframes,
      exchangeFilter: scanJobs.exchangeFilter,
      cursor: scanJobs.cursor,
      discoveredCount: scanJobs.discoveredCount,
      binanceDiscovered: scanJobs.binanceDiscovered,
      mexcDiscovered: scanJobs.mexcDiscovered,
      scannedCount: scanJobs.scannedCount,
      qualifiedCount: scanJobs.qualifiedCount,
      failedCount: scanJobs.failedCount,
      excludedCount: scanJobs.excludedCount,
      rejectionSummary: scanJobs.rejectionSummary,
      errorMessage: scanJobs.errorMessage,
      startedAt: scanJobs.startedAt,
      updatedAt: scanJobs.updatedAt,
      finishedAt: scanJobs.finishedAt,
    })
    .from(scanJobs)
    .orderBy(desc(scanJobs.id))
    .limit(1);

  return rows[0] ?? null;
}

export async function getRecentScanJobs(limit = 8) {
  return db
    .select({
      id: scanJobs.id,
      status: scanJobs.status,
      trigger: scanJobs.trigger,
      timeframes: scanJobs.timeframes,
      discoveredCount: scanJobs.discoveredCount,
      scannedCount: scanJobs.scannedCount,
      qualifiedCount: scanJobs.qualifiedCount,
      failedCount: scanJobs.failedCount,
      excludedCount: scanJobs.excludedCount,
      startedAt: scanJobs.startedAt,
      finishedAt: scanJobs.finishedAt,
    })
    .from(scanJobs)
    .orderBy(desc(scanJobs.id))
    .limit(limit);
}

export async function checkDbTablesReady(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1 FROM settings LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}
