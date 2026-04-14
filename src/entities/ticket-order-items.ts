import {
  index,
  uniqueIndex,
  timestamp,
  uuid,
  varchar,
  integer,
  pgTable,
} from "drizzle-orm/pg-core";

import { orderItemStatusEnum } from "./enums";
import { eventSections } from "./event-sections";
import { seats } from "./seats";
import { ticketOrders } from "./ticket-orders";

export const ticketOrderItems = pgTable(
  "ticket_order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => ticketOrders.id, { onDelete: "cascade" }),
    seatId: uuid("seat_id")
      .notNull()
      .references(() => seats.id, { onDelete: "restrict" }),
    eventSectionId: uuid("event_section_id")
      .notNull()
      .references(() => eventSections.id, { onDelete: "restrict" }),
    seatCodeSnapshot: varchar("seat_code_snapshot", { length: 40 }).notNull(),
    rowLabelSnapshot: varchar("row_label_snapshot", { length: 20 }).notNull(),
    seatNumberSnapshot: integer("seat_number_snapshot").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
    status: orderItemStatusEnum("status").notNull().default("reserved"),
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    orderSeatUniqueIdx: uniqueIndex(
      "ticket_order_items_order_seat_unique_idx",
    ).on(table.orderId, table.seatId),
    seatStatusIdx: index("ticket_order_items_seat_status_idx").on(
      table.seatId,
      table.status,
    ),
    orderStatusIdx: index("ticket_order_items_order_status_idx").on(
      table.orderId,
      table.status,
    ),
  }),
);
