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

import { eventStatusEnum } from "./enums";
import { users } from "./users";

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
    timezone: varchar("timezone", { length: 80 })
      .notNull()
      .default("Asia/Jakarta"),
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
