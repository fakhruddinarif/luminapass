import {
  index,
  uniqueIndex,
  text,
  timestamp,
  uuid,
  varchar,
  integer,
  pgTable,
} from "drizzle-orm/pg-core";

import { sectionStatusEnum } from "./enums";
import { events } from "./events";

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
    color: varchar("color", { length: 16 }),
    priceCents: integer("price_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("IDR"),
    seatCapacity: integer("seat_capacity").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    status: sectionStatusEnum("status").notNull().default("active"),
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
    eventSortIdx: index("event_sections_event_sort_idx").on(
      table.eventId,
      table.sortOrder,
    ),
    statusIdx: index("event_sections_status_idx").on(table.status),
  }),
);
