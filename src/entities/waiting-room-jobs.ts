import {
  index,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { queueStatusEnum } from "./enums";
import { events } from "./events";
import { users } from "./users";

export const waitingRoomJobs = pgTable(
  "waiting_room_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    queueToken: varchar("queue_token", { length: 128 }).notNull().unique(),
    messageId: varchar("message_id", { length: 128 }),
    status: queueStatusEnum("status").notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    retryCount: integer("retry_count").notNull().default(0),
    payload: jsonb("payload").$type<Record<string, unknown> | null>(),
    queuedAt: timestamp("queued_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    processedAt: timestamp("processed_at", {
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
    eventStatusIdx: index("waiting_room_jobs_event_status_idx").on(
      table.eventId,
      table.status,
    ),
    userStatusIdx: index("waiting_room_jobs_user_status_idx").on(
      table.userId,
      table.status,
    ),
    queuedAtIdx: index("waiting_room_jobs_queued_at_idx").on(table.queuedAt),
  }),
);
