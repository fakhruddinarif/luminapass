import type { CreateTicketOrderBody } from "../dtos/ticket-orders";
import type {
  eventSections,
  events,
  paymentTransactions,
  ticketOrderItems,
  ticketOrders,
  users,
} from "../entities";

export type TicketOrderRow = typeof ticketOrders.$inferSelect;
export type TicketOrderItemRow = typeof ticketOrderItems.$inferSelect;
export type EventSectionRow = typeof eventSections.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type UserRow = typeof users.$inferSelect;
export type PaymentTransactionRow = typeof paymentTransactions.$inferSelect;

export interface EventWithSections extends EventRow {
  sections: EventSectionRow[];
}

export interface TicketOrderAggregate extends TicketOrderRow {
  items: TicketOrderItemRow[];
  event: EventWithSections | null;
  user: UserRow | null;
  payments: PaymentTransactionRow[];
}

export interface TicketOrderWithPayments extends TicketOrderRow {
  payments: PaymentTransactionRow[];
}

export interface PaginatedTicketOrdersResult {
  items: TicketOrderWithPayments[];
  page: number;
  size: number;
  totalItem: number;
  totalPage: number;
}

export interface TicketUnitScanResult {
  id: string;
  ticketCode: string;
  orderId: string;
  eventId: string;
  eventSectionId: string;
  usedAt: Date;
}

export interface TicketOrdersRepositoryContract {
  createTicketOrder(
    actorUserId: string,
    input: CreateTicketOrderBody,
  ): Promise<TicketOrderWithPayments>;
  listTicketOrders(
    page: number,
    size: number,
    actorUserId?: string,
  ): Promise<PaginatedTicketOrdersResult>;
  getTicketOrderById(orderId: string): Promise<TicketOrderWithPayments | null>;
  scanTicketUnitByCode(ticketCode: string): Promise<TicketUnitScanResult>;
}

export interface TicketOrdersServiceContract {
  createTicketOrder(
    actorUserId: string,
    input: CreateTicketOrderBody,
  ): Promise<TicketOrderWithPayments>;
  listTicketOrders(
    page: number,
    size: number,
    actorUserId: string,
    actorRole: "customer" | "admin",
  ): Promise<PaginatedTicketOrdersResult>;
  getTicketOrderById(
    orderId: string,
    actorUserId: string,
    actorRole: "customer" | "admin",
  ): Promise<TicketOrderWithPayments>;
  scanTicketUnitByCode(
    ticketCode: string,
    actorRole: "customer" | "admin",
  ): Promise<TicketUnitScanResult>;
}

export class TicketOrdersServiceError extends Error {
  constructor(
    public readonly code:
      | "EVENT_NOT_FOUND"
      | "EVENT_NOT_ON_SALE"
      | "EVENT_SECTION_NOT_FOUND"
      | "INSUFFICIENT_STOCK"
      | "INVALID_SECTION_QUANTITY"
      | "ORDER_IDEMPOTENCY_EXISTS"
      | "ORDER_NOT_FOUND"
      | "FORBIDDEN"
      | "TICKET_NOT_FOUND"
      | "TICKET_ALREADY_USED"
      | "DATABASE_ERROR",
    message: string,
  ) {
    super(message);
  }
}
