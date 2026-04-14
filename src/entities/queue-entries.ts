import {
  index,
  uniqueIndex,
  jsonb,
  timestamp,
  uuid,
  varchar,
  integer,
  pgTable,
} from "drizzle-orm/pg-core";

import { queueEntryStatusEnum } from "./enums";
import { events } from "./events";
import { users } from "./users";

export const queueEntries = pgTable(
  "queue_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    queueToken: varchar("queue_token", { length: 120 }).notNull(),
    status: queueEntryStatusEnum("status").notNull().default("waiting"),
    position: integer("position").notNull(),
    priority: integer("priority").notNull().default(0),
    requestedAt: timestamp("requested_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    allowedAt: timestamp("allowed_at", { withTimezone: true, mode: "date" }),
    enteredAt: timestamp("entered_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    tokenUniqueIdx: uniqueIndex("queue_entries_token_unique_idx").on(
      table.queueToken,
    ),
    eventStatusIdx: index("queue_entries_event_status_idx").on(
      table.eventId,
      table.status,
    ),
    userStatusIdx: index("queue_entries_user_status_idx").on(
      table.userId,
      table.status,
    ),
  }),
);
