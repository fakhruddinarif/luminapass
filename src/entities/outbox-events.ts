import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    aggregateType: varchar("aggregate_type", { length: 64 }).notNull(),
    aggregateId: uuid("aggregate_id"),
    eventType: varchar("event_type", { length: 128 }).notNull(),
    routingKey: varchar("routing_key", { length: 128 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastError: text("last_error"),
    publishedAt: timestamp("published_at", {
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
    statusNextAttemptIdx: index("outbox_events_status_next_attempt_idx").on(
      table.status,
      table.nextAttemptAt,
    ),
    aggregateIdx: index("outbox_events_aggregate_idx").on(
      table.aggregateType,
      table.aggregateId,
    ),
    createdAtIdx: index("outbox_events_created_at_idx").on(table.createdAt),
  }),
);
