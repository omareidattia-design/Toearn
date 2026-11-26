export const TELEGRAM_MODES = ["ALL", "FAVORITES", "OFF"] as const;
export type TelegramMode = (typeof TELEGRAM_MODES)[number];
export type TelegramConfig = "MISSING" | "INVALID" | "CONFIGURED";
export type TelegramConfigSource = "UI" | "ENV" | null;
export type TelegramDeliveryState = "QUEUED" | "SENDING" | "SENT" | "FAILED" | "SKIPPED";
export type TelegramIssue = "RATE_LIMITED" | "UNAVAILABLE" | "BAD_TOKEN" | "CHAT_ACCESS" | "REJECTED" | "EXPIRED" | "INACTIVE" | "FILTERED";

export interface TelegramStatus {
  config: TelegramConfig;
  source: TelegramConfigSource;
  chatMasked: string | null;
  mode: TelegramMode;
  pendingCount: number;
  sentCount: number;
  lastSentAt: string | null;
  lastIssue: TelegramIssue | null;
  lastTest: { status: TelegramDeliveryState; createdAt: string; error: TelegramIssue | null } | null;
}
