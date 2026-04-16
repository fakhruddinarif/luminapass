import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { streamResolutionEnum } from "./enums";
import { events } from "./events";

export const livestreamVariants = pgTable(
  "livestream_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    resolution: streamResolutionEnum("resolution").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bitrateKbps: integer("bitrate_kbps").notNull(),
    playlistUrl: text("playlist_url").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventResolutionUniqueIdx: uniqueIndex(
      "livestream_variants_event_resolution_unique_idx",
    ).on(table.eventId, table.resolution),
    eventDefaultIdx: index("livestream_variants_event_default_idx").on(
      table.eventId,
      table.isDefault,
    ),
  }),
);

export const livestreamVariantsRelations = relations(
  livestreamVariants,
  ({ one }) => ({
    event: one(events, {
      fields: [livestreamVariants.eventId],
      references: [events.id],
    }),
  }),
);
