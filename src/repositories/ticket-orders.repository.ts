import { and, eq, inArray, gte, lte, sql } from "drizzle-orm";

import { db } from "../config/db";
import {
  eventSections,
  events,
  stockMovements,
  ticketOrderItems,
  ticketOrders,
} from "../entities";
import type { TicketOrdersRepositoryContract } from "../interfaces/ticket-orders.interface";
import { synchronizeEventStatusTx } from "./events.repository";
import { enqueueOutboxEventTx } from "./outbox.repository";
import { scanTicketUnitByCode } from "./ticket-units.repository";

function makeOrderCode(): string {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  const tsPart = Date.now().toString().slice(-8);
  return `ORD-${tsPart}-${randomPart}`;
}

export const ticketOrdersRepository: TicketOrdersRepositoryContract = {
  async createTicketOrder(actorUserId, input) {
    return db.transaction(async (tx) => {
      let event = await tx.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });

      if (!event) {
        throw new Error("EVENT_NOT_FOUND");
      }

      // Sync lifecycle status before validating sale eligibility.
      await synchronizeEventStatusTx(tx, input.eventId);

      event = await tx.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });

      if (!event) {
        throw new Error("EVENT_NOT_FOUND");
      }

      if (event.status !== "on_sale") {
        throw new Error("EVENT_NOT_ON_SALE");
      }

      const sectionIds = input.items.map((item) => item.eventSectionId);
      const sections = await tx
        .select()
        .from(eventSections)
        .where(
          and(
            inArray(eventSections.id, sectionIds),
            eq(eventSections.eventId, input.eventId),
          ),
        );

      if (sections.length !== sectionIds.length) {
        throw new Error("EVENT_SECTION_NOT_FOUND");
      }

      const quantityBySectionId = new Map<string, number>();
      for (const row of input.items) {
        quantityBySectionId.set(
          row.eventSectionId,
          (quantityBySectionId.get(row.eventSectionId) ?? 0) + row.quantity,
        );
      }

      const orderItemPayload = sections.map((section) => {
        const quantity = quantityBySectionId.get(section.id) ?? 0;
        const unitPrice = Number(section.price);
        const lineTotal = unitPrice * quantity;

        return {
          eventSectionId: section.id,
          sectionCode: section.code,
          sectionName: section.name,
          unitPrice: unitPrice.toFixed(2),
          quantity,
          lineTotal: lineTotal.toFixed(2),
        };
      });

      const subtotalAmount = orderItemPayload.reduce(
        (acc, row) => acc + Number(row.lineTotal),
        0,
      );

      const [createdOrder] = await tx
        .insert(ticketOrders)
        .values({
          orderCode: makeOrderCode(),
          eventId: input.eventId,
          userId: actorUserId,
          idempotencyKey: input.idempotencyKey,
          status: "awaiting_payment",
          subtotalAmount: subtotalAmount.toFixed(2),
          totalAmount: subtotalAmount.toFixed(2),
          paymentProvider: input.paymentProvider ?? "mock",
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        })
        .returning();

      if (!createdOrder) {
        throw new Error("ORDER_INSERT_FAILED");
      }

      const createdItems =
        orderItemPayload.length > 0
          ? await tx
              .insert(ticketOrderItems)
              .values(
                orderItemPayload.map((row) => ({
                  orderId: createdOrder.id,
                  eventSectionId: row.eventSectionId,
                  sectionCode: row.sectionCode,
                  sectionName: row.sectionName,
                  unitPrice: row.unitPrice,
                  quantity: row.quantity,
                  lineTotal: row.lineTotal,
                })),
              )
              .returning()
          : [];

      // Ensure expected relational shape is available before further stock handling.
      if (createdItems.length !== orderItemPayload.length) {
        throw new Error("ORDER_ITEMS_INSERT_FAILED");
      }

      for (const row of orderItemPayload) {
        const [updatedSection] = await tx
          .update(eventSections)
          .set({
            capacity: sql`${eventSections.capacity} - ${row.quantity}`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(eventSections.id, row.eventSectionId),
              gte(eventSections.capacity, row.quantity),
            ),
          )
          .returning();

        if (!updatedSection) {
          throw new Error("INSUFFICIENT_STOCK");
        }

        await tx.insert(stockMovements).values({
          eventSectionId: row.eventSectionId,
          orderId: createdOrder.id,
          actorUserId,
          movementType: "reserve",
          quantity: -row.quantity,
          stockBefore: updatedSection.capacity + row.quantity,
          stockAfter: updatedSection.capacity,
          reason: "Ticket reserved while order is awaiting payment",
        });
      }

      await synchronizeEventStatusTx(tx, input.eventId);

      await enqueueOutboxEventTx(tx, {
        aggregateType: "ticket_order",
        aggregateId: createdOrder.id,
        eventType: "order.created",
        routingKey: "order.created",
        payload: {
          orderId: createdOrder.id,
          orderCode: createdOrder.orderCode,
          eventId: createdOrder.eventId,
          userId: createdOrder.userId,
          status: createdOrder.status,
        },
      });

      const createdOrderWithPayments = await tx.query.ticketOrders.findFirst({
        where: eq(ticketOrders.id, createdOrder.id),
        with: {
          payments: true,
        },
      });

      if (!createdOrderWithPayments) {
        throw new Error("ORDER_NOT_FOUND");
      }

      return createdOrderWithPayments;
    });
  },

  async getTicketOrderById(orderId) {
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

  async listTicketOrders(page, size, actorUserId) {
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

  async scanTicketUnitByCode(ticketCode) {
    return scanTicketUnitByCode(ticketCode);
  },
};

export async function expireAwaitingPaymentOrders(
  limit = 100,
): Promise<number> {
  return db.transaction(async (tx) => {
    const expiredOrders = await tx.query.ticketOrders.findMany({
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

    let processed = 0;
    const impactedEventIds = new Set<string>();

    for (const order of expiredOrders) {
      for (const item of order.items) {
        if (!item.eventSection) {
          continue;
        }

        impactedEventIds.add(item.eventSection.eventId);

        const [updatedSection] = await tx
          .update(eventSections)
          .set({
            capacity: sql`${eventSections.capacity} + ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(eventSections.id, item.eventSection.id))
          .returning();

        if (!updatedSection) {
          continue;
        }

        await tx.insert(stockMovements).values({
          eventSectionId: item.eventSection.id,
          orderId: order.id,
          movementType: "release",
          quantity: item.quantity,
          stockBefore: updatedSection.capacity - item.quantity,
          stockAfter: updatedSection.capacity,
          reason: "Order expired, reserved stock released",
        });
      }

      await tx
        .update(ticketOrders)
        .set({
          status: "expired",
          failedReason: "Payment window expired",
          updatedAt: new Date(),
        })
        .where(eq(ticketOrders.id, order.id));

      processed += 1;
    }

    for (const eventId of impactedEventIds) {
      await synchronizeEventStatusTx(tx, eventId);
    }

    return processed;
  });
}
