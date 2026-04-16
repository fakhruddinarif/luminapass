import {
  uniqueIndex,
  text,
  numeric,
  timestamp,
  uuid,
  varchar,
  integer,
  pgTable,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { events } from "./events";
import { stockMovements } from "./stock-movements";
import { ticketOrderItems } from "./ticket-order-items";

export const eventSections = pgTable(
  "event_sections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    price: numeric("price", { precision: 10, scale: 2 }).notNull().default("0"),
    capacity: integer("capacity").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventCodeUniqueIdx: uniqueIndex("event_sections_event_code_unique_idx").on(
      table.eventId,
      table.code,
    ),
  }),
);

export const eventSectionsRelations = relations(
  eventSections,
  ({ many, one }) => ({
    event: one(events, {
      fields: [eventSections.eventId],
      references: [events.id],
    }),
    ticketOrderItems: many(ticketOrderItems),
    stockMovements: many(stockMovements),
  }),
);
