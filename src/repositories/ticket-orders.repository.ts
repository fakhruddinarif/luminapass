import { and, eq, inArray, gte, lte, sql } from "drizzle-orm";

import { db } from "../config/db";
import type { CreateTicketOrderBody } from "../dtos/ticket-orders";
import {
  eventSections,
  events,
  stockMovements,
  ticketOrderItems,
  ticketOrders,
} from "../entities";
import type {
  TicketOrderAggregate,
  TicketOrdersRepositoryContract,
} from "../interfaces/ticket-orders.interface";
import { enqueueOutboxEventTx } from "./outbox.repository";

function makeOrderCode(): string {
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  const tsPart = Date.now().toString().slice(-8);
  return `ORD-${tsPart}-${randomPart}`;
}

export const ticketOrdersRepository: TicketOrdersRepositoryContract = {
  async createTicketOrder(actorUserId, input) {
    return db.transaction(async (tx) => {
      const event = await tx.query.events.findFirst({
        where: eq(events.id, input.eventId),
      });

      if (!event) {
        throw new Error("EVENT_NOT_FOUND");
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

      return {
        order: createdOrder,
        items: createdItems,
      } satisfies TicketOrderAggregate;
    });
  },

  async getTicketOrderById(orderId) {
    const order = await db.query.ticketOrders.findFirst({
      where: eq(ticketOrders.id, orderId),
    });

    if (!order) {
      return null;
    }

    const items = await db
      .select()
      .from(ticketOrderItems)
      .where(eq(ticketOrderItems.orderId, order.id));

    return {
      order,
      items,
    } satisfies TicketOrderAggregate;
  },
};

export async function expireAwaitingPaymentOrders(
  limit = 100,
): Promise<number> {
  return db.transaction(async (tx) => {
    const expiredOrders = await tx
      .select({
        id: ticketOrders.id,
      })
      .from(ticketOrders)
      .where(
        and(
          inArray(ticketOrders.status, ["awaiting_payment", "reserved"]),
          lte(ticketOrders.expiresAt, new Date()),
        ),
      )
      .limit(limit);

    let processed = 0;

    for (const order of expiredOrders) {
      const items = await tx
        .select()
        .from(ticketOrderItems)
        .where(eq(ticketOrderItems.orderId, order.id));

      for (const item of items) {
        const [section] = await tx
          .select()
          .from(eventSections)
          .where(eq(eventSections.id, item.eventSectionId))
          .limit(1);

        if (!section) {
          continue;
        }

        const [updatedSection] = await tx
          .update(eventSections)
          .set({
            capacity: sql`${eventSections.capacity} + ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(eventSections.id, section.id))
          .returning();

        if (!updatedSection) {
          continue;
        }

        await tx.insert(stockMovements).values({
          eventSectionId: section.id,
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

    return processed;
  });
}
