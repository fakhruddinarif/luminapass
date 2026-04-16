import { DatabaseError } from "pg";

import type { CreateTicketOrderBody } from "../dtos/ticket-orders";
import {
  type PaginatedTicketOrdersResult,
  TicketOrdersServiceError,
  type TicketOrderWithPayments,
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
  constructor(private readonly repository: TicketOrdersRepositoryContract) {}

  async createTicketOrder(
    actorUserId: string,
    input: CreateTicketOrderBody,
  ): Promise<TicketOrderWithPayments> {
    try {
      return await this.repository.createTicketOrder(actorUserId, input);
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

export const ticketOrdersService = new TicketOrdersService(
  ticketOrdersRepository,
);
