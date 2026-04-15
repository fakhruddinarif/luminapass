import { DatabaseError } from "pg";

import type { CreateTicketOrderBody } from "../dtos/ticket-orders";
import { publishAppEvent } from "../config/rabbitmq-runtime";
import {
  TicketOrdersServiceError,
  type TicketOrderAggregate,
  type TicketOrdersRepositoryContract,
  type TicketOrdersServiceContract,
} from "../interfaces/ticket-orders.interface";
import { ticketOrdersRepository } from "../repositories/ticket-orders.repository";

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
  }

  throw new TicketOrdersServiceError(
    "DATABASE_ERROR",
    "A database error occurred while processing order",
  );
}

export class TicketOrdersService implements TicketOrdersServiceContract {
  constructor(private readonly repository: TicketOrdersRepositoryContract) {}

  async createTicketOrder(
    actorUserId: string,
    input: CreateTicketOrderBody,
  ): Promise<TicketOrderAggregate> {
    try {
      const result = await this.repository.createTicketOrder(
        actorUserId,
        input,
      );

      await publishAppEvent("order.created", {
        orderId: result.order.id,
        orderCode: result.order.orderCode,
        eventId: result.order.eventId,
        userId: result.order.userId,
        status: result.order.status,
      });

      return result;
    } catch (error) {
      mapOrderDatabaseError(error);
    }
  }

  async getTicketOrderById(orderId: string): Promise<TicketOrderAggregate> {
    try {
      const order = await this.repository.getTicketOrderById(orderId);
      if (!order) {
        throw new TicketOrdersServiceError(
          "ORDER_NOT_FOUND",
          "Order was not found",
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
}

export const ticketOrdersService = new TicketOrdersService(
  ticketOrdersRepository,
);
