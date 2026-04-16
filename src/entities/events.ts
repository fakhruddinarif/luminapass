import {
  index,
  uniqueIndex,
  boolean,
  text,
  timestamp,
  uuid,
  varchar,
  pgTable,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { eventStatusEnum } from "./enums";
import { eventSections } from "./event-sections";
import { livestreamVariants } from "./livestream-variants";
import { streamSessions } from "./stream-sessions";
import { ticketOrders } from "./ticket-orders";
import { users } from "./users";
import { waitingRoomJobs } from "./waiting-room-jobs";

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: varchar("slug", { length: 180 }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    venueName: varchar("venue_name", { length: 200 }).notNull(),
    venueCity: varchar("venue_city", { length: 120 }).notNull(),
    venueAddress: text("venue_address"),
    startsAt: timestamp("starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }),
    saleStartsAt: timestamp("sale_starts_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    saleEndsAt: timestamp("sale_ends_at", { withTimezone: true, mode: "date" }),
    status: eventStatusEnum("status").notNull().default("draft"),
    coverImageUrl: text("cover_image_url"),
    livestreamEnabled: boolean("livestream_enabled").notNull().default(false),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    updatedBy: uuid("updated_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slugUniqueIdx: uniqueIndex("events_slug_unique_idx").on(table.slug),
    statusIdx: index("events_status_idx").on(table.status),
    startsAtIdx: index("events_starts_at_idx").on(table.startsAt),
    createdByIdx: index("events_created_by_idx").on(table.createdBy),
  }),
);

export const eventsRelations = relations(events, ({ many, one }) => ({
  createdByUser: one(users, {
    fields: [events.createdBy],
    references: [users.id],
    relationName: "events_created_by_user",
  }),
  updatedByUser: one(users, {
    fields: [events.updatedBy],
    references: [users.id],
    relationName: "events_updated_by_user",
  }),
  sections: many(eventSections),
  ticketOrders: many(ticketOrders),
  waitingRoomJobs: many(waitingRoomJobs),
  livestreamVariants: many(livestreamVariants),
  streamSessions: many(streamSessions),
}));
