import {
  index,
  uniqueIndex,
  boolean,
  text,
  timestamp,
  uuid,
  integer,
  pgTable,
} from "drizzle-orm/pg-core";

import { streamQualityEnum } from "./enums";
import { streams } from "./streams";

export const streamRenditions = pgTable(
  "stream_renditions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    streamId: uuid("stream_id")
      .notNull()
      .references(() => streams.id, { onDelete: "cascade" }),
    quality: streamQualityEnum("quality").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bitrateKbps: integer("bitrate_kbps").notNull(),
    playlistUrl: text("playlist_url").notNull(),
    segmentPrefix: text("segment_prefix"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    streamQualityUniqueIdx: uniqueIndex(
      "stream_renditions_stream_quality_unique_idx",
    ).on(table.streamId, table.quality),
    streamActiveIdx: index("stream_renditions_stream_active_idx").on(
      table.streamId,
      table.isActive,
    ),
  }),
);
