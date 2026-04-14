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

import { seatStatusEnum } from "./enums";
import { eventSections } from "./event-sections";

export const seats = pgTable(
  "seats",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventSectionId: uuid("event_section_id")
      .notNull()
      .references(() => eventSections.id, { onDelete: "cascade" }),
    seatCode: varchar("seat_code", { length: 40 }).notNull(),
    rowLabel: varchar("row_label", { length: 20 }).notNull(),
    seatNumber: integer("seat_number").notNull(),
    displayName: varchar("display_name", { length: 80 }).notNull(),
    status: seatStatusEnum("status").notNull().default("available"),
    holdExpiresAt: timestamp("hold_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sectionSeatUniqueIdx: uniqueIndex("seats_section_seat_unique_idx").on(
      table.eventSectionId,
      table.seatCode,
    ),
    sectionRowSeatUniqueIdx: uniqueIndex(
      "seats_section_row_seat_unique_idx",
    ).on(table.eventSectionId, table.rowLabel, table.seatNumber),
    sectionStatusIdx: index("seats_section_status_idx").on(
      table.eventSectionId,
      table.status,
    ),
  }),
);
