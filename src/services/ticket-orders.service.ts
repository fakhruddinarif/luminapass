import { DatabaseError } from "pg";

import type { CreateTicketOrderBody } from "../dtos/ticket-orders";
import { db } from "../config/db";
import {
  type PaginatedTicketOrdersResult,
  TicketOrdersServiceError,
  type TicketOrderWithPayments,
  type TicketOrdersServiceContract,
} from "../interfaces/ticket-orders.interface";
import { synchronizeEventStatusTx } from "../repositories/events.repository";
import { enqueueOutboxEventTx } from "../repositories/outbox.repository";
import { ticketOrdersRepository } from "../repositories/ticket-orders.repository";

interface TicketOrdersServiceDependencies {
  synchronizeEventStatusTx: typeof synchronizeEventStatusTx;
  enqueueOutboxEventTx: typeof enqueueOutboxEventTx;
}

const ticketOrdersServiceDependencies: TicketOrdersServiceDependencies = {
  synchronizeEventStatusTx,
  enqueueOutboxEventTx,
};

function mapOrderDatabaseError(error: unknown): never {
  if (error instanceof DatabaseError && error.code === "23505") {
    throw new TicketOrdersServiceError(
      "ORDER_IDEMPOTENCY_EXISTS",
      "Order idempotency key already exists",
    );
  }

  if (error instanceof DatabaseError && error.code === "23503") {
    throw new TicketOrdersServiceError(
      "EVENT_NOT_FOUND",
      "Related event data was not found",
    );
  }

  if (error instanceof Error) {
    if (error.message === "EVENT_NOT_FOUND") {
      throw new TicketOrdersServiceError(
        "EVENT_NOT_FOUND",
        "Event was not found",
      );
    }

    if (error.message === "EVENT_NOT_ON_SALE") {
      throw new TicketOrdersServiceError(
        "EVENT_NOT_ON_SALE",
        "Event is not available for purchase",
      );
    }

    if (error.message === "INSUFFICIENT_STOCK") {
      throw new TicketOrdersServiceError(
        "INSUFFICIENT_STOCK",
        "One or more sections are sold out",
      );
    }

    if (error.message === "EVENT_SECTION_NOT_FOUND") {
      throw new TicketOrdersServiceError(
        "EVENT_SECTION_NOT_FOUND",
        "One or more event sections were not found",
      );
    }

    if (error.message === "TICKET_NOT_FOUND") {
      throw new TicketOrdersServiceError(
        "TICKET_NOT_FOUND",
        "Ticket was not found",
      );
    }

    if (error.message === "TICKET_ALREADY_USED") {
      throw new TicketOrdersServiceError(
        "TICKET_ALREADY_USED",
        "Ticket has already been used",
      );
    }
  }

  throw new TicketOrdersServiceError(
    "DATABASE_ERROR",
    "A database error occurred while processing order",
  );
}

export class TicketOrdersService implements TicketOrdersServiceContract {
  constructor(
    private readonly repository: typeof ticketOrdersRepository,
    private readonly deps: TicketOrdersServiceDependencies = ticketOrdersServiceDependencies,
  ) {}

  async createTicketOrder(
    actorUserId: string,
    input: CreateTicketOrderBody,
  ): Promise<TicketOrderWithPayments> {
    try {
      return await db.transaction(async (tx) => {
        let event = await this.repository.findEventByIdTx(input.eventId, tx);

        if (!event) {
          throw new Error("EVENT_NOT_FOUND");
        }

        await this.deps.synchronizeEventStatusTx(input.eventId, new Date(), tx);
        event = await this.repository.findEventByIdTx(input.eventId, tx);

        if (!event) {
          throw new Error("EVENT_NOT_FOUND");
        }

        if (event.status !== "on_sale") {
          throw new Error("EVENT_NOT_ON_SALE");
        }

        const sectionIds = input.items.map((item) => item.eventSectionId);
        const sections = await this.repository.findEventSectionsByIdsTx(
          input.eventId,
          sectionIds,
          tx,
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

        const createdOrder = await this.repository.insertTicketOrderTx(
          {
            orderCode: this.repository.makeOrderCode(),
            eventId: input.eventId,
            userId: actorUserId,
            idempotencyKey: input.idempotencyKey,
            status: "awaiting_payment",
            subtotalAmount: subtotalAmount.toFixed(2),
            totalAmount: subtotalAmount.toFixed(2),
            paymentProvider: input.paymentProvider ?? "mock",
            expiresAt: new Date(Date.now() + 60 * 1000),
          },
          tx,
        );

        if (!createdOrder) {
          throw new Error("ORDER_INSERT_FAILED");
        }

        const createdItems = await this.repository.insertTicketOrderItemsTx(
          orderItemPayload.map((row) => ({
            orderId: createdOrder.id,
            eventSectionId: row.eventSectionId,
            sectionCode: row.sectionCode,
            sectionName: row.sectionName,
            unitPrice: row.unitPrice,
            quantity: row.quantity,
            lineTotal: row.lineTotal,
          })),
          tx,
        );

        if (createdItems.length !== orderItemPayload.length) {
          throw new Error("ORDER_ITEMS_INSERT_FAILED");
        }

        for (const row of orderItemPayload) {
          const updatedSection = await this.repository.reserveSectionCapacityTx(
            row.eventSectionId,
            row.quantity,
            tx,
          );

          if (!updatedSection) {
            throw new Error("INSUFFICIENT_STOCK");
          }

          await this.repository.insertStockMovementTx(
            {
              eventSectionId: row.eventSectionId,
              orderId: createdOrder.id,
              actorUserId,
              movementType: "reserve",
              quantity: -row.quantity,
              stockBefore: updatedSection.capacity + row.quantity,
              stockAfter: updatedSection.capacity,
              reason: "Ticket reserved while order is awaiting payment",
            },
            tx,
          );
        }

        await this.deps.synchronizeEventStatusTx(input.eventId, new Date(), tx);

        await this.deps.enqueueOutboxEventTx(tx, {
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

        const createdOrderWithPayments =
          await this.repository.getTicketOrderByIdWithPaymentsTx(
            createdOrder.id,
            tx,
          );

        if (!createdOrderWithPayments) {
          throw new Error("ORDER_NOT_FOUND");
        }

        return createdOrderWithPayments;
      });
    } catch (error) {
      mapOrderDatabaseError(error);
    }
  }

  async listTicketOrders(
    page: number,
    size: number,
    actorUserId: string,
    actorRole: "customer" | "admin",
  ): Promise<PaginatedTicketOrdersResult> {
    try {
      return await this.repository.listTicketOrders(
        page,
        size,
        actorRole === "admin" ? undefined : actorUserId,
      );
    } catch (error) {
      mapOrderDatabaseError(error);
    }
  }

  async getTicketOrderById(
    orderId: string,
    actorUserId: string,
    actorRole: "customer" | "admin",
  ): Promise<TicketOrderWithPayments> {
    try {
      const order = await this.repository.getTicketOrderById(orderId);
      if (!order) {
        throw new TicketOrdersServiceError(
          "ORDER_NOT_FOUND",
          "Order was not found",
        );
      }

      if (actorRole !== "admin" && order.userId !== actorUserId) {
        throw new TicketOrdersServiceError(
          "FORBIDDEN",
          "You are not allowed to access this order",
        );
      }

      return order;
    } catch (error) {
      if (error instanceof TicketOrdersServiceError) {
        throw error;
      }

      mapOrderDatabaseError(error);
    }
  }

  async scanTicketUnitByCode(
    ticketCode: string,
    actorRole: "customer" | "admin",
  ) {
    if (actorRole !== "admin") {
      throw new TicketOrdersServiceError(
        "FORBIDDEN",
        "Only admin users can scan tickets",
      );
    }

    try {
      return await this.repository.scanTicketUnitByCode(ticketCode);
    } catch (error) {
      mapOrderDatabaseError(error);
    }
  }
}

export async function expireAwaitingPaymentOrders(
  limit = 100,
): Promise<number> {
  return db.transaction(async (tx) => {
    const expiredOrders =
      await ticketOrdersRepository.findExpiredAwaitingPaymentOrdersTx(
        limit,
        tx,
      );

    let processed = 0;
    const impactedEventIds = new Set<string>();

    for (const order of expiredOrders) {
      for (const item of order.items) {
        if (!item.eventSection) {
          continue;
        }

        impactedEventIds.add(item.eventSection.eventId);

        const updatedSection =
          await ticketOrdersRepository.releaseSectionCapacityTx(
            item.eventSection.id,
            item.quantity,
            tx,
          );

        if (!updatedSection) {
          continue;
        }

        await ticketOrdersRepository.insertStockMovementTx(
          {
            eventSectionId: item.eventSection.id,
            orderId: order.id,
            movementType: "release",
            quantity: item.quantity,
            stockBefore: updatedSection.capacity - item.quantity,
            stockAfter: updatedSection.capacity,
            reason: "Order expired, reserved stock released",
          },
          tx,
        );
      }

      await ticketOrdersRepository.updateTicketOrderStatusTx(
        order.id,
        {
          status: "expired",
          failedReason: "Payment window expired",
          updatedAt: new Date(),
        },
        tx,
      );

      processed += 1;
    }

    for (const eventId of impactedEventIds) {
      await synchronizeEventStatusTx(eventId, new Date(), tx);
    }

    return processed;
  });
}

export const ticketOrdersService = new TicketOrdersService(
  ticketOrdersRepository,
);
