import {
  index,
  uniqueIndex,
  integer,
  timestamp,
  uuid,
  varchar,
  pgTable,
} from "drizzle-orm/pg-core";

import { streamQualityEnum, viewerSessionStatusEnum } from "./enums";
import { streams } from "./streams";
import { users } from "./users";

export const streamViewerSessions = pgTable(
  "stream_viewer_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    streamId: uuid("stream_id")
      .notNull()
      .references(() => streams.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    playbackSessionToken: varchar("playback_session_token", {
      length: 120,
    }).notNull(),
    status: viewerSessionStatusEnum("status").notNull().default("active"),
    selectedQuality: streamQualityEnum("selected_quality"),
    bandwidthKbps: integer("bandwidth_kbps"),
    deviceType: varchar("device_type", { length: 40 }),
    ipAddress: varchar("ip_address", { length: 45 }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenUniqueIdx: uniqueIndex("stream_viewer_sessions_token_unique_idx").on(
      table.playbackSessionToken,
    ),
    streamStatusIdx: index("stream_viewer_sessions_stream_status_idx").on(
      table.streamId,
      table.status,
    ),
    userStatusIdx: index("stream_viewer_sessions_user_status_idx").on(
      table.userId,
      table.status,
    ),
  }),
);
