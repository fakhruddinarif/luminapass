import type { CreateTicketOrderBody } from "../dtos/ticket-orders";
import type {
  eventSections,
  ticketOrderItems,
  ticketOrders,
} from "../entities";

export type TicketOrderRow = typeof ticketOrders.$inferSelect;
export type TicketOrderItemRow = typeof ticketOrderItems.$inferSelect;
export type EventSectionRow = typeof eventSections.$inferSelect;

export interface TicketOrderAggregate {
  order: TicketOrderRow;
  items: TicketOrderItemRow[];
}

export interface TicketOrdersRepositoryContract {
  createTicketOrder(
    actorUserId: string,
    input: CreateTicketOrderBody,
  ): Promise<TicketOrderAggregate>;
  getTicketOrderById(orderId: string): Promise<TicketOrderAggregate | null>;
}

export interface TicketOrdersServiceContract {
  createTicketOrder(
    actorUserId: string,
    input: CreateTicketOrderBody,
  ): Promise<TicketOrderAggregate>;
  getTicketOrderById(orderId: string): Promise<TicketOrderAggregate>;
}

export class TicketOrdersServiceError extends Error {
  constructor(
    public readonly code:
      | "EVENT_NOT_FOUND"
      | "EVENT_SECTION_NOT_FOUND"
      | "INSUFFICIENT_STOCK"
      | "INVALID_SECTION_QUANTITY"
      | "ORDER_IDEMPOTENCY_EXISTS"
      | "ORDER_NOT_FOUND"
      | "DATABASE_ERROR",
    message: string,
  ) {
    super(message);
  }
}
