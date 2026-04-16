import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { stockMovementTypeEnum } from "./enums";
import { eventSections } from "./event-sections";
import { ticketOrders } from "./ticket-orders";
import { users } from "./users";

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventSectionId: uuid("event_section_id")
      .notNull()
      .references(() => eventSections.id, { onDelete: "cascade" }),
    orderId: uuid("order_id").references(() => ticketOrders.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    movementType: stockMovementTypeEnum("movement_type").notNull(),
    quantity: integer("quantity").notNull(),
    stockBefore: integer("stock_before").notNull(),
    stockAfter: integer("stock_after").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sectionCreatedAtIdx: index("stock_movements_section_created_at_idx").on(
      table.eventSectionId,
      table.createdAt,
    ),
    movementTypeIdx: index("stock_movements_movement_type_idx").on(
      table.movementType,
    ),
    orderIdx: index("stock_movements_order_idx").on(table.orderId),
  }),
);

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  eventSection: one(eventSections, {
    fields: [stockMovements.eventSectionId],
    references: [eventSections.id],
  }),
  order: one(ticketOrders, {
    fields: [stockMovements.orderId],
    references: [ticketOrders.id],
  }),
  actorUser: one(users, {
    fields: [stockMovements.actorUserId],
    references: [users.id],
  }),
}));
