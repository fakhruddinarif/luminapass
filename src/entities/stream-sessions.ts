import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { streamSessionStatusEnum, streamResolutionEnum } from "./enums";
import { events } from "./events";
import { streamQualityEvents } from "./stream-quality-events";
import { users } from "./users";

export const streamSessions = pgTable(
  "stream_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sessionToken: varchar("session_token", { length: 128 }).notNull().unique(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 512 }),
    status: streamSessionStatusEnum("status").notNull().default("started"),
    currentResolution: streamResolutionEnum("current_resolution")
      .notNull()
      .default("720p"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventStatusIdx: index("stream_sessions_event_status_idx").on(
      table.eventId,
      table.status,
    ),
    userStatusIdx: index("stream_sessions_user_status_idx").on(
      table.userId,
      table.status,
    ),
    startedAtIdx: index("stream_sessions_started_at_idx").on(table.startedAt),
  }),
);

export const streamSessionsRelations = relations(
  streamSessions,
  ({ many, one }) => ({
    event: one(events, {
      fields: [streamSessions.eventId],
      references: [events.id],
    }),
    user: one(users, {
      fields: [streamSessions.userId],
      references: [users.id],
    }),
    qualityEvents: many(streamQualityEvents),
  }),
);
