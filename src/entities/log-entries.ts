import {
  index,
  jsonb,
  text,
  timestamp,
  uuid,
  varchar,
  pgTable,
} from "drizzle-orm/pg-core";

import { logLevelEnum } from "./enums";
import { users } from "./users";

export const logEntries = pgTable(
  "log_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: varchar("request_id", { length: 120 }),
    traceId: varchar("trace_id", { length: 120 }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventName: varchar("event_name", { length: 120 }).notNull(),
    level: logLevelEnum("level").notNull().default("info"),
    source: varchar("source", { length: 60 }),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    flushedAt: timestamp("flushed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    levelIdx: index("log_entries_level_idx").on(table.level),
    userIdx: index("log_entries_user_idx").on(table.userId),
    createdAtIdx: index("log_entries_created_at_idx").on(table.createdAt),
  }),
);
