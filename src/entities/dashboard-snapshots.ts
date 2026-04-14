import {
  index,
  jsonb,
  timestamp,
  uuid,
  integer,
  pgTable,
} from "drizzle-orm/pg-core";

import { dashboardScopeEnum } from "./enums";
import { events } from "./events";

export const dashboardSnapshots = pgTable(
  "dashboard_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scope: dashboardScopeEnum("scope").notNull().default("global"),
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "cascade",
    }),
    ticketSalesCount: integer("ticket_sales_count").notNull().default(0),
    seatsAvailableCount: integer("seats_available_count").notNull().default(0),
    queueLength: integer("queue_length").notNull().default(0),
    activeViewersCount: integer("active_viewers_count").notNull().default(0),
    streamHealthyCount: integer("stream_healthy_count").notNull().default(0),
    revenueCents: integer("revenue_cents").notNull().default(0),
    errorCount: integer("error_count").notNull().default(0),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    snapshotAt: timestamp("snapshot_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    scopeIdx: index("dashboard_snapshots_scope_idx").on(
      table.scope,
      table.snapshotAt,
    ),
    eventIdx: index("dashboard_snapshots_event_idx").on(
      table.eventId,
      table.snapshotAt,
    ),
  }),
);
