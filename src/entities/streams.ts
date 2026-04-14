import {
  index,
  uniqueIndex,
  boolean,
  jsonb,
  text,
  timestamp,
  uuid,
  varchar,
  pgTable,
} from "drizzle-orm/pg-core";

import { streamStatusEnum } from "./enums";
import { events } from "./events";

export const streams = pgTable(
  "streams",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    ingestUrl: text("ingest_url"),
    playbackUrl: text("playback_url"),
    hlsManifestUrl: text("hls_manifest_url"),
    streamKey: varchar("stream_key", { length: 120 }).notNull(),
    status: streamStatusEnum("status").notNull().default("scheduled"),
    isLive: boolean("is_live").notNull().default(false),
    liveStartedAt: timestamp("live_started_at", {
      withTimezone: true,
      mode: "date",
    }),
    liveEndedAt: timestamp("live_ended_at", {
      withTimezone: true,
      mode: "date",
    }),
    playerSettings: jsonb("player_settings").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventUniqueIdx: uniqueIndex("streams_event_unique_idx").on(table.eventId),
    streamKeyUniqueIdx: uniqueIndex("streams_stream_key_unique_idx").on(
      table.streamKey,
    ),
    statusIdx: index("streams_status_idx").on(table.status, table.isLive),
  }),
);
