import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { TelegramDeliveryState, TelegramIssue, TelegramMode } from "@/lib/telegram-model";
import type { EntryMode } from "@/lib/types";

export interface ScanCandidate {
  symbol: string;
  baseAsset: string;
  exchange: "BINANCE" | "MEXC";
  marketType: "CRYPTO" | "STOCK";
  sector: string;
  fullName?: string;
}

export interface SignalReason {
  code: string;
  labelAr: string;
  labelEn: string;
  detail: string;
  points: number;
}

export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("default"),
  selectedTimeframes: jsonb("selected_timeframes")
    .$type<string[]>()
    .notNull()
    .default(["1m", "5m", "15m", "1h", "4h", "1d"]),
  timeframePreset: text("timeframe_preset").notNull().default("all"),
  entryMode: text("entry_mode").$type<EntryMode>().notNull().default("B"),
  autoScanEnabled: boolean("auto_scan_enabled").notNull().default(true),
  autoScanIntervalMinutes: integer("auto_scan_interval_minutes")
    .notNull()
    .default(5),
  scoreThreshold: integer("score_threshold").notNull().default(58),
  tradeSizeUsdt: doublePrecision("trade_size_usdt").notNull().default(100),
  signalExpiryMinutes: integer("signal_expiry_minutes").notNull().default(60),
  language: text("language").notNull().default("ar"),
  soundEnabled: boolean("sound_enabled").notNull().default(true),
  telegramMode: text("telegram_mode").$type<TelegramMode>().notNull().default("ALL"),
  browserNotifications: boolean("browser_notifications")
    .notNull()
    .default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const scanJobs = pgTable(
  "scan_jobs",
  {
    id: serial("id").primaryKey(),
    status: text("status").notNull().default("RUNNING"), // RUNNING | DONE | STOPPED | FAILED
    trigger: text("trigger").notNull().default("MANUAL"), // MANUAL | AUTO
    timeframes: jsonb("timeframes").$type<string[]>().notNull(),
    exchangeFilter: text("exchange_filter").notNull().default("ALL"), // ALL | BINANCE | MEXC
    candidates: jsonb("candidates").$type<ScanCandidate[]>().notNull().default([]),
    cursor: integer("cursor").notNull().default(0),
    discoveredCount: integer("discovered_count").notNull().default(0),
    binanceDiscovered: integer("binance_discovered").notNull().default(0),
    mexcDiscovered: integer("mexc_discovered").notNull().default(0),
    scannedCount: integer("scanned_count").notNull().default(0),
    qualifiedCount: integer("qualified_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    excludedCount: integer("excluded_count").notNull().default(0),
    rejectionSummary: jsonb("rejection_summary")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    finishedAt: timestamp("finished_at"),
  },
  (table) => [index("scan_jobs_status_idx").on(table.status)]
);

export const signals = pgTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    scanJobId: integer("scan_job_id").references(() => scanJobs.id, {
      onDelete: "set null",
    }),
    symbol: text("symbol").notNull(),
    baseAsset: text("base_asset").notNull(),
    exchange: text("exchange").notNull(), // BINANCE | MEXC
    marketType: text("market_type").notNull().default("CRYPTO"), // CRYPTO | STOCK
    sector: text("sector").notNull().default("أخرى"),
    strategyName: text("strategy_name")
      .notNull()
      .default("SMC_ICT_BOTTOM_HUNT"),
    status: text("status").notNull().default("ACTIVE"), // ACTIVE | ACTIVATED | EXPIRED | SUPERSEDED
    score: integer("score").notNull(),
    grade: text("grade").notNull().default("A"), // A+ | A | B
    primaryTimeframe: text("primary_timeframe").notNull(),
    qualifiedTimeframes: jsonb("qualified_timeframes")
      .$type<string[]>()
      .notNull()
      .default([]),
    entryPrice: doublePrecision("entry_price").notNull(),
    currentPriceAtDiscovery: doublePrecision("current_price_at_discovery").notNull(),
    stopLoss: doublePrecision("stop_loss").notNull(),
    tp1: doublePrecision("tp1").notNull(),
    tp2: doublePrecision("tp2").notNull(),
    tp3: doublePrecision("tp3").notNull(),
    slPercent: doublePrecision("sl_percent").notNull(),
    tp1Percent: doublePrecision("tp1_percent").notNull(),
    tp2Percent: doublePrecision("tp2_percent").notNull(),
    tp3Percent: doublePrecision("tp3_percent").notNull(),
    riskRewardTp2: doublePrecision("risk_reward_tp2").notNull(),
    riskLevel: text("risk_level").notNull().default("MEDIUM"), // LOW | MEDIUM | HIGH
    tradeSizeUsdt: doublePrecision("trade_size_usdt").notNull().default(100),
    quantity: doublePrecision("quantity").notNull(),
    estimatedFeesUsdt: doublePrecision("estimated_fees_usdt").notNull(),
    expectedProfitTp2Usdt: doublePrecision("expected_profit_tp2_usdt").notNull(),
    potentialLossUsdt: doublePrecision("potential_loss_usdt").notNull(),
    reasons: jsonb("reasons").$type<SignalReason[]>().notNull().default([]),
    analysisSnapshot: jsonb("analysis_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    discoveredAt: timestamp("discovered_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("signals_active_symbol_exchange_uidx")
      .on(table.symbol, table.exchange)
      .where(sql`${table.status} = 'ACTIVE'`),
    index("signals_status_score_idx").on(table.status, table.score),
  ]
);

export const trades = pgTable(
  "trades",
  {
    id: serial("id").primaryKey(),
    signalId: integer("signal_id").references(() => signals.id, {
      onDelete: "set null",
    }),
    symbol: text("symbol").notNull(),
    baseAsset: text("base_asset").notNull(),
    exchange: text("exchange").notNull(), // BINANCE | MEXC
    marketType: text("market_type").notNull().default("CRYPTO"),
    sector: text("sector").notNull().default("أخرى"),
    status: text("status").notNull().default("OPEN"), // OPEN | CLOSED_TP3 | CLOSED_SL | CLOSED_MANUAL
    primaryTimeframe: text("primary_timeframe").notNull(),
    qualifiedTimeframes: jsonb("qualified_timeframes")
      .$type<string[]>()
      .notNull()
      .default([]),
    originalScore: integer("original_score").notNull(),
    entryPrice: doublePrecision("entry_price").notNull(), // FROZEN & IMMUTABLE
    stopLoss: doublePrecision("stop_loss").notNull(),
    tp1: doublePrecision("tp1").notNull(),
    tp2: doublePrecision("tp2").notNull(),
    tp3: doublePrecision("tp3").notNull(),
    tp1Hit: boolean("tp1_hit").notNull().default(false),
    tp2Hit: boolean("tp2_hit").notNull().default(false),
    tp3Hit: boolean("tp3_hit").notNull().default(false),
    tradeSizeUsdt: doublePrecision("trade_size_usdt").notNull().default(100),
    quantity: doublePrecision("quantity").notNull(),
    estimatedFeesUsdt: doublePrecision("estimated_fees_usdt").notNull().default(0.25),
    reasons: jsonb("reasons").$type<SignalReason[]>().notNull().default([]),
    lastPrice: doublePrecision("last_price").notNull(),
    unrealizedPnlUsdt: doublePrecision("unrealized_pnl_usdt").notNull().default(0),
    unrealizedPnlPercent: doublePrecision("unrealized_pnl_percent")
      .notNull()
      .default(0),
    realizedPnlUsdt: doublePrecision("realized_pnl_usdt"),
    realizedPnlPercent: doublePrecision("realized_pnl_percent"),
    closePrice: doublePrecision("close_price"),
    closeReason: text("close_reason"),
    openedAt: timestamp("opened_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("trades_open_symbol_exchange_uidx")
      .on(table.symbol, table.exchange)
      .where(sql`${table.status} = 'OPEN'`),
    index("trades_status_idx").on(table.status),
  ]
);

export const tradeEvents = pgTable(
  "trade_events",
  {
    id: serial("id").primaryKey(),
    tradeId: integer("trade_id")
      .references(() => trades.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(), // OPENED | TP1_HIT | TP2_HIT | TP3_HIT | SL_HIT | CLOSED_MANUAL | LEVELS_UPDATED
    price: doublePrecision("price").notNull(),
    pnlUsdt: doublePrecision("pnl_usdt"),
    messageAr: text("message_ar").notNull(),
    messageEn: text("message_en").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("trade_events_trade_idx").on(table.tradeId)]
);

export const favorites = pgTable(
  "favorites",
  {
    id: serial("id").primaryKey(),
    symbol: text("symbol").notNull(),
    exchange: text("exchange").notNull(), // BINANCE | MEXC
    marketType: text("market_type").notNull().default("CRYPTO"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("favorites_symbol_exchange_uidx").on(
      table.symbol,
      table.exchange
    ),
  ]
);

export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(), // FAVORITE_SIGNAL | TP_HIT | SL_HIT | SCAN_DONE | SCAN_STOPPED | SCAN_FAILED | TRADE_OPENED
    symbol: text("symbol"),
    exchange: text("exchange"),
    titleAr: text("title_ar").notNull(),
    titleEn: text("title_en").notNull(),
    bodyAr: text("body_ar").notNull(),
    bodyEn: text("body_en").notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("notifications_created_idx").on(table.createdAt)]
);

export const telegramOutbox = pgTable("telegram_outbox", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<"SIGNAL" | "TEST">().notNull(),
  signalId: integer("signal_id").references(() => signals.id, { onDelete: "cascade" }),
  status: text("status").$type<TelegramDeliveryState>().notNull().default("QUEUED"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  telegramMessageId: text("telegram_message_id"),
  errorCode: text("error_code").$type<TelegramIssue>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("telegram_signal_once_uidx").on(table.signalId),
  index("telegram_delivery_due_idx").on(table.status, table.nextAttemptAt),
  index("telegram_delivery_kind_idx").on(table.kind, table.createdAt),
  index("telegram_delivery_attempt_idx").on(table.lastAttemptAt),
]);

// Telegram bot credentials entered from the workspace UI.
// Stored server-side only: no API route ever selects this row into a response.
export const telegramSecrets = pgTable("telegram_secrets", {
  id: text("id").primaryKey().default("default"),
  botToken: text("bot_token").notNull(),
  chatId: text("chat_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
