import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { orderStatusEnum } from "./enums";
import { events } from "./events";
import { users } from "./users";

export const ticketOrders = pgTable(
  "ticket_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderCode: varchar("order_code", { length: 64 }).notNull().unique(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    idempotencyKey: varchar("idempotency_key", { length: 128 })
      .notNull()
      .unique(),
    status: orderStatusEnum("status").notNull().default("queued"),
    subtotalAmount: numeric("subtotal_amount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    queueToken: varchar("queue_token", { length: 128 }),
    paymentProvider: varchar("payment_provider", { length: 64 })
      .notNull()
      .default("mock"),
    paymentReference: varchar("payment_reference", { length: 128 }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    paidAt: timestamp("paid_at", { withTimezone: true, mode: "date" }),
    failedReason: text("failed_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventStatusIdx: index("ticket_orders_event_status_idx").on(
      table.eventId,
      table.status,
    ),
    userStatusIdx: index("ticket_orders_user_status_idx").on(
      table.userId,
      table.status,
    ),
    createdAtIdx: index("ticket_orders_created_at_idx").on(table.createdAt),
  }),
);
