import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { paymentStatusEnum } from "./enums";
import { ticketOrders } from "./ticket-orders";

export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ticketOrders.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull().default("mock"),
    externalTxnId: varchar("external_txn_id", { length: 128 }),
    providerOrderId: varchar("provider_order_id", { length: 128 }),
    idempotencyKey: varchar("idempotency_key", { length: 128 })
      .notNull()
      .unique(),
    amount: numeric("amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    rawProviderStatus: varchar("raw_provider_status", { length: 64 }),
    paymentType: varchar("payment_type", { length: 64 }),
    channelCode: varchar("channel_code", { length: 64 }),
    fraudStatus: varchar("fraud_status", { length: 32 }),
    statusMessage: text("status_message"),
    webhookEventId: varchar("webhook_event_id", { length: 128 }),
    webhookSignatureValid: boolean("webhook_signature_valid")
      .notNull()
      .default(false),
    webhookReceivedAt: timestamp("webhook_received_at", {
      withTimezone: true,
      mode: "date",
    }),
    simulatorCode: varchar("simulator_code", { length: 16 }),
    failureReason: text("failure_reason"),
    providerRequestPayload: jsonb("provider_request_payload").$type<Record<
      string,
      unknown
    > | null>(),
    providerResponsePayload: jsonb("provider_response_payload").$type<Record<
      string,
      unknown
    > | null>(),
    webhookPayload: jsonb("webhook_payload").$type<Record<
      string,
      unknown
    > | null>(),
    chargedAt: timestamp("charged_at", { withTimezone: true, mode: "date" }),
    settledAt: timestamp("settled_at", { withTimezone: true, mode: "date" }),
    expiredAt: timestamp("expired_at", { withTimezone: true, mode: "date" }),
    cancelledAt: timestamp("cancelled_at", {
      withTimezone: true,
      mode: "date",
    }),
    refundedAt: timestamp("refunded_at", { withTimezone: true, mode: "date" }),
    processedAt: timestamp("processed_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderStatusIdx: index("payment_transactions_order_status_idx").on(
      table.orderId,
      table.status,
    ),
    providerIdx: index("payment_transactions_provider_idx").on(table.provider),
    externalTxnIdx: index("payment_transactions_external_txn_idx").on(
      table.externalTxnId,
    ),
    webhookEventIdx: index("payment_transactions_webhook_event_idx").on(
      table.provider,
      table.webhookEventId,
    ),
    webhookEventUniqueIdx: uniqueIndex(
      "payment_transactions_provider_webhook_event_unique_idx",
    ).on(table.provider, table.webhookEventId),
    createdAtIdx: index("payment_transactions_created_at_idx").on(
      table.createdAt,
    ),
  }),
);

export const paymentTransactionsRelations = relations(
  paymentTransactions,
  ({ one }) => ({
    order: one(ticketOrders, {
      fields: [paymentTransactions.orderId],
      references: [ticketOrders.id],
    }),
  }),
);
