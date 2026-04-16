import { index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { streamResolutionEnum } from "./enums";
import { streamSessions } from "./stream-sessions";

export const streamQualityEvents = pgTable(
  "stream_quality_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    streamSessionId: uuid("stream_session_id")
      .notNull()
      .references(() => streamSessions.id, { onDelete: "cascade" }),
    fromResolution: streamResolutionEnum("from_resolution"),
    toResolution: streamResolutionEnum("to_resolution").notNull(),
    observedBandwidthKbps: integer("observed_bandwidth_kbps"),
    bufferHealthMs: integer("buffer_health_ms"),
    switchedAt: timestamp("switched_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sessionSwitchedAtIdx: index(
      "stream_quality_events_session_switched_at_idx",
    ).on(table.streamSessionId, table.switchedAt),
  }),
);

export const streamQualityEventsRelations = relations(
  streamQualityEvents,
  ({ one }) => ({
    streamSession: one(streamSessions, {
      fields: [streamQualityEvents.streamSessionId],
      references: [streamSessions.id],
    }),
  }),
);
