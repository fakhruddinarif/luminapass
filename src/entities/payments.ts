import {
  index,
  uniqueIndex,
  jsonb,
  text,
  timestamp,
  uuid,
  varchar,
  integer,
  pgTable,
} from "drizzle-orm/pg-core";

import { paymentStatusEnum } from "./enums";
import { ticketOrders } from "./ticket-orders";

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ticketOrders.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 50 }).notNull(),
    providerTransactionId: varchar("provider_transaction_id", { length: 120 }),
    method: varchar("method", { length: 60 }),
    status: paymentStatusEnum("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("IDR"),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    expiredAt: timestamp("expired_at", { withTimezone: true, mode: "date" }),
    failureReason: text("failure_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderUniqueIdx: uniqueIndex("payments_order_unique_idx").on(table.orderId),
    providerRefUniqueIdx: uniqueIndex("payments_provider_ref_unique_idx").on(
      table.provider,
      table.providerTransactionId,
    ),
    orderStatusIdx: index("payments_order_status_idx").on(
      table.orderId,
      table.status,
    ),
  }),
);
