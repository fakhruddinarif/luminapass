import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["customer", "admin"]);
export const userStatusEnum = pgEnum("user_status", [
  "active",
  "suspended",
  "deleted",
]);

export const eventStatusEnum = pgEnum("event_status", [
  "draft",
  "published",
  "on_sale",
  "sold_out",
  "live",
  "finished",
  "cancelled",
]);

export const sectionStatusEnum = pgEnum("section_status", [
  "active",
  "inactive",
]);
export const seatStatusEnum = pgEnum("seat_status", [
  "available",
  "reserved",
  "sold",
  "blocked",
  "disabled",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "pending_payment",
  "awaiting_confirmation",
  "paid",
  "expired",
  "cancelled",
  "refunded",
]);

export const orderItemStatusEnum = pgEnum("order_item_status", [
  "reserved",
  "sold",
  "released",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "processing",
  "paid",
  "failed",
  "expired",
  "refunded",
  "cancelled",
]);

export const queueEntryStatusEnum = pgEnum("queue_entry_status", [
  "waiting",
  "allowed",
  "entered",
  "expired",
  "rejected",
  "cancelled",
]);

export const generationJobStatusEnum = pgEnum("generation_job_status", [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const streamStatusEnum = pgEnum("stream_status", [
  "scheduled",
  "ingesting",
  "live",
  "paused",
  "ended",
  "failed",
]);

export const streamQualityEnum = pgEnum("stream_quality", [
  "1080p",
  "720p",
  "480p",
]);

export const viewerSessionStatusEnum = pgEnum("viewer_session_status", [
  "active",
  "idle",
  "ended",
  "kicked",
]);

export const logLevelEnum = pgEnum("log_level", [
  "debug",
  "info",
  "warn",
  "error",
  "fatal",
]);

export const dashboardScopeEnum = pgEnum("dashboard_scope", [
  "global",
  "event",
]);
