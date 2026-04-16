import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { eventSections } from "./event-sections";
import { events } from "./events";
import { ticketOrderItems } from "./ticket-order-items";
import { ticketOrders } from "./ticket-orders";
import { users } from "./users";

export const ticketUnits = pgTable(
  "ticket_units",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ticketOrders.id, { onDelete: "cascade" }),
    orderItemId: uuid("order_item_id")
      .notNull()
      .references(() => ticketOrderItems.id, { onDelete: "cascade" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    eventSectionId: uuid("event_section_id")
      .notNull()
      .references(() => eventSections.id, { onDelete: "restrict" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ticketCode: varchar("ticket_code", { length: 80 }).notNull().unique(),
    barcodeValue: varchar("barcode_value", { length: 180 }).notNull().unique(),
    barcodeFormat: varchar("barcode_format", { length: 32 })
      .notNull()
      .default("code128"),
    barcodePayload: text("barcode_payload").notNull(),
    isUsed: boolean("is_used").notNull().default(false),
    usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
    emailedAt: timestamp("emailed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdx: index("ticket_units_order_idx").on(table.orderId),
    orderItemIdx: index("ticket_units_order_item_idx").on(table.orderItemId),
    userIdx: index("ticket_units_user_idx").on(table.userId),
    eventIdx: index("ticket_units_event_idx").on(table.eventId),
    emailStatusIdx: index("ticket_units_email_status_idx").on(
      table.orderId,
      table.emailedAt,
    ),
  }),
);

export const ticketUnitsRelations = relations(ticketUnits, ({ one }) => ({
  order: one(ticketOrders, {
    fields: [ticketUnits.orderId],
    references: [ticketOrders.id],
  }),
  orderItem: one(ticketOrderItems, {
    fields: [ticketUnits.orderItemId],
    references: [ticketOrderItems.id],
  }),
  event: one(events, {
    fields: [ticketUnits.eventId],
    references: [events.id],
  }),
  eventSection: one(eventSections, {
    fields: [ticketUnits.eventSectionId],
    references: [eventSections.id],
  }),
  user: one(users, {
    fields: [ticketUnits.userId],
    references: [users.id],
  }),
}));
