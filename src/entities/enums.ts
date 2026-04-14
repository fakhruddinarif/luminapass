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

export const orderStatusEnum = pgEnum("order_status", [
  "queued",
  "processing",
  "reserved",
  "awaiting_payment",
  "paid",
  "failed",
  "cancelled",
  "expired",
]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "authorized",
  "captured",
  "failed",
  "expired",
  "refunded",
  "cancelled",
]);

export const queueStatusEnum = pgEnum("queue_status", [
  "queued",
  "processing",
  "completed",
  "failed",
  "dead_letter",
]);

export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "reserve",
  "release",
  "sale",
  "refund",
  "admin_add",
  "admin_withdraw",
  "sync_adjustment",
]);

export const streamResolutionEnum = pgEnum("stream_resolution", [
  "1080p",
  "720p",
  "480p",
]);

export const streamSessionStatusEnum = pgEnum("stream_session_status", [
  "started",
  "playing",
  "paused",
  "ended",
]);
