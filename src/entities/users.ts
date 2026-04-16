import {
  index,
  uniqueIndex,
  text,
  timestamp,
  uuid,
  varchar,
  pgTable,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { userRoleEnum, userStatusEnum } from "./enums";
import { events } from "./events";
import { stockMovements } from "./stock-movements";
import { streamSessions } from "./stream-sessions";
import { ticketOrders } from "./ticket-orders";
import { waitingRoomJobs } from "./waiting-room-jobs";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    username: varchar("username", { length: 80 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: varchar("full_name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    avatarUrl: text("avatar_url"),
    role: userRoleEnum("role").notNull().default("customer"),
    status: userStatusEnum("status").notNull().default("active"),
    lastLoginAt: timestamp("last_login_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true, mode: "date" }),
  },
  (table) => ({
    emailUniqueIdx: uniqueIndex("users_email_unique_idx").on(table.email),
    usernameUniqueIdx: uniqueIndex("users_username_unique_idx").on(
      table.username,
    ),
    roleIdx: index("users_role_idx").on(table.role),
    statusIdx: index("users_status_idx").on(table.status),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  createdEvents: many(events, { relationName: "events_created_by_user" }),
  updatedEvents: many(events, { relationName: "events_updated_by_user" }),
  ticketOrders: many(ticketOrders),
  waitingRoomJobs: many(waitingRoomJobs),
  streamSessions: many(streamSessions),
  stockMovements: many(stockMovements),
}));
