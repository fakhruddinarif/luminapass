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

export const auditTrails = pgTable(
  "audit_trails",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    endpoint: varchar("endpoint", { length: 255 }).notNull(),
    datetime: timestamp("datetime", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    ip: varchar("ip", { length: 64 }).notNull(),
    user: text("user").notNull(),
    method: varchar("method", { length: 16 }).notNull(),
    request: jsonb("request").$type<unknown>(),
    response: jsonb("response").$type<unknown>(),
    status: integer("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    endpointIdx: index("audit_trails_endpoint_idx").on(table.endpoint),
    methodIdx: index("audit_trails_method_idx").on(table.method),
    datetimeIdx: index("audit_trails_datetime_idx").on(table.datetime),
    userIdx: index("audit_trails_user_idx").on(table.user),
    statusIdx: index("audit_trails_status_idx").on(table.status),
  }),
);
