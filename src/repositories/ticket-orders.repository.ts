import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { db } from "../config/db";
import {
  eventSections,
  events,
  stockMovements,
  ticketOrderItems,
  ticketOrders,
} from "../entities";
import { scanTicketUnitByCode } from "./ticket-units.repository";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | DbTx;

function useExecutor(executor?: DbExecutor): DbExecutor {
  return executor ?? db;
}

export function makeOrderCode(): string {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  const tsPart = Date.now().toString().slice(-8);
  return `ORD-${tsPart}-${randomPart}`;
}

export async function findEventByIdTx(eventId: string, executor?: DbExecutor) {
  const orm = useExecutor(executor);
  return orm.query.events.findFirst({
    where: eq(events.id, eventId),
  });
}

export async function findEventSectionsByIdsTx(
  eventId: string,
  sectionIds: string[],
  executor?: DbExecutor,
) {
  if (sectionIds.length === 0) {
    return [] as Array<typeof eventSections.$inferSelect>;
  }

  const orm = useExecutor(executor);
  return orm
    .select()
    .from(eventSections)
    .where(
      and(
        inArray(eventSections.id, sectionIds),
        eq(eventSections.eventId, eventId),
      ),
    );
}

export async function insertTicketOrderTx(
  payload: typeof ticketOrders.$inferInsert,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [createdOrder] = await orm
    .insert(ticketOrders)
    .values(payload)
    .returning();
  return createdOrder ?? null;
}

export async function insertTicketOrderItemsTx(
  payload: Array<typeof ticketOrderItems.$inferInsert>,
  executor?: DbExecutor,
) {
  if (payload.length === 0) {
    return [] as Array<typeof ticketOrderItems.$inferSelect>;
  }

  const orm = useExecutor(executor);
  return orm.insert(ticketOrderItems).values(payload).returning();
}

export async function reserveSectionCapacityTx(
  sectionId: string,
  quantity: number,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [updatedSection] = await orm
    .update(eventSections)
    .set({
      capacity: sql`${eventSections.capacity} - ${quantity}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(eventSections.id, sectionId),
        gte(eventSections.capacity, quantity),
      ),
    )
    .returning();

  return updatedSection ?? null;
}

export async function releaseSectionCapacityTx(
  sectionId: string,
  quantity: number,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [updatedSection] = await orm
    .update(eventSections)
    .set({
      capacity: sql`${eventSections.capacity} + ${quantity}`,
      updatedAt: new Date(),
    })
    .where(eq(eventSections.id, sectionId))
    .returning();

  return updatedSection ?? null;
}

export async function insertStockMovementTx(
  payload: typeof stockMovements.$inferInsert,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  await orm.insert(stockMovements).values(payload);
}

export async function getTicketOrderByIdWithPaymentsTx(
  orderId: string,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  return orm.query.ticketOrders.findFirst({
    where: eq(ticketOrders.id, orderId),
    with: {
      payments: true,
    },
  });
}

export async function findExpiredAwaitingPaymentOrdersTx(
  limit = 100,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  return orm.query.ticketOrders.findMany({
    where: and(
      inArray(ticketOrders.status, ["awaiting_payment", "reserved"]),
      lte(ticketOrders.expiresAt, new Date()),
    ),
    with: {
      items: {
        with: {
          eventSection: true,
        },
      },
    },
    limit,
  });
}

export async function updateTicketOrderStatusTx(
  orderId: string,
  payload: Partial<typeof ticketOrders.$inferInsert>,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [updated] = await orm
    .update(ticketOrders)
    .set(payload)
    .where(eq(ticketOrders.id, orderId))
    .returning();

  return updated ?? null;
}

export const ticketOrdersRepository = {
  makeOrderCode,
  findEventByIdTx,
  findEventSectionsByIdsTx,
  insertTicketOrderTx,
  insertTicketOrderItemsTx,
  reserveSectionCapacityTx,
  releaseSectionCapacityTx,
  insertStockMovementTx,
  getTicketOrderByIdWithPaymentsTx,
  findExpiredAwaitingPaymentOrdersTx,
  updateTicketOrderStatusTx,

  async getTicketOrderById(orderId: string) {
    const order = await db.query.ticketOrders.findFirst({
      where: eq(ticketOrders.id, orderId),
      with: {
        payments: true,
      },
    });

    if (!order) {
      return null;
    }

    return order;
  },

  async listTicketOrders(page: number, size: number, actorUserId?: string) {
    const pageQuery = Math.max(1, page);
    const sizeQuery = Math.max(1, Math.min(100, size));
    const offset = (pageQuery - 1) * sizeQuery;

    const whereClause = actorUserId
      ? eq(ticketOrders.userId, actorUserId)
      : undefined;

    const orders = await db.query.ticketOrders.findMany({
      where: whereClause,
      with: {
        payments: true,
      },
      orderBy: (table, { desc }) => desc(table.createdAt),
      limit: sizeQuery,
      offset,
    });

    const [countRow] = whereClause
      ? await db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(ticketOrders)
          .where(whereClause)
      : await db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(ticketOrders);

    const totalItem = countRow?.count ?? 0;
    const totalPage = Math.max(1, Math.ceil(totalItem / sizeQuery));

    return {
      items: orders,
      page: pageQuery,
      size: sizeQuery,
      totalItem,
      totalPage,
    };
  },

  async scanTicketUnitByCode(ticketCode: string) {
    return scanTicketUnitByCode(ticketCode);
  },
};
