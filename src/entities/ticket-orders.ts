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

import { orderStatusEnum } from "./enums";
import { events } from "./events";
import { queueEntries } from "./queue-entries";
import { users } from "./users";

export const ticketOrders = pgTable(
  "ticket_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderNumber: varchar("order_number", { length: 40 }).notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    queueEntryId: uuid("queue_entry_id").references(() => queueEntries.id, {
      onDelete: "set null",
    }),
    status: orderStatusEnum("status").notNull().default("pending_payment"),
    currency: varchar("currency", { length: 3 }).notNull().default("IDR"),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    serviceFeeCents: integer("service_fee_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    reservedAt: timestamp("reserved_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    confirmedAt: timestamp("confirmed_at", {
      withTimezone: true,
      mode: "date",
    }),
    cancelledAt: timestamp("cancelled_at", {
      withTimezone: true,
      mode: "date",
    }),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderNumberUniqueIdx: uniqueIndex(
      "ticket_orders_order_number_unique_idx",
    ).on(table.orderNumber),
    userStatusIdx: index("ticket_orders_user_status_idx").on(
      table.userId,
      table.status,
    ),
    eventStatusIdx: index("ticket_orders_event_status_idx").on(
      table.eventId,
      table.status,
    ),
    expiresAtIdx: index("ticket_orders_expires_at_idx").on(table.expiresAt),
  }),
);
