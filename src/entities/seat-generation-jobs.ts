import {
  index,
  timestamp,
  uuid,
  text,
  jsonb,
  integer,
  pgTable,
} from "drizzle-orm/pg-core";

import { generationJobStatusEnum } from "./enums";
import { events } from "./events";
import { users } from "./users";

export const seatGenerationJobs = pgTable(
  "seat_generation_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: generationJobStatusEnum("status").notNull().default("queued"),
    totalSections: integer("total_sections").notNull().default(0),
    totalSeats: integer("total_seats").notNull().default(0),
    generatedSeats: integer("generated_seats").notNull().default(0),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    eventStatusIdx: index("seat_generation_jobs_event_status_idx").on(
      table.eventId,
      table.status,
    ),
    requestedByIdx: index("seat_generation_jobs_requested_by_idx").on(
      table.requestedBy,
    ),
  }),
);
