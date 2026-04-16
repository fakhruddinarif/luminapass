import {
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { eventSections } from "./event-sections";
import { ticketOrders } from "./ticket-orders";
import { ticketUnits } from "./ticket-units";

export const ticketOrderItems = pgTable(
  "ticket_order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ticketOrders.id, { onDelete: "cascade" }),
    eventSectionId: uuid("event_section_id")
      .notNull()
      .references(() => eventSections.id, { onDelete: "restrict" }),
    sectionCode: varchar("section_code", { length: 40 }).notNull(),
    sectionName: varchar("section_name", { length: 120 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    quantity: integer("quantity").notNull().default(1),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 })
      .notNull()
      .default("0"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderIdx: index("ticket_order_items_order_idx").on(table.orderId),
    eventSectionIdx: index("ticket_order_items_event_section_idx").on(
      table.eventSectionId,
    ),
  }),
);

export const ticketOrderItemsRelations = relations(
  ticketOrderItems,
  ({ many, one }) => ({
    order: one(ticketOrders, {
      fields: [ticketOrderItems.orderId],
      references: [ticketOrders.id],
    }),
    eventSection: one(eventSections, {
      fields: [ticketOrderItems.eventSectionId],
      references: [eventSections.id],
    }),
    ticketUnits: many(ticketUnits),
  }),
);
