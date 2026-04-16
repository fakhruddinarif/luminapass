import type {
  CreatePaymentTransactionBody,
  PaymentWebhookBody,
} from "../dtos/payment-transactions";
import type {
  eventSections,
  events,
  paymentTransactions,
  ticketOrderItems,
  ticketOrders,
} from "../entities";

export type PaymentTransactionRow = typeof paymentTransactions.$inferSelect;
export type TicketOrderRow = typeof ticketOrders.$inferSelect;
export type TicketOrderItemRow = typeof ticketOrderItems.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type EventSectionRow = typeof eventSections.$inferSelect;

export interface EventWithSections extends EventRow {
  sections: EventSectionRow[];
}

export interface TicketOrderWithRelations extends TicketOrderRow {
  items: TicketOrderItemRow[];
  event: EventWithSections | null;
}

export interface PaymentTransactionAggregate extends PaymentTransactionRow {
  order: TicketOrderWithRelations | null;
}

export interface PaginatedPaymentTransactionsResult {
  items: PaymentTransactionAggregate[];
  page: number;
  size: number;
  totalItem: number;
  totalPage: number;
}

export interface PaymentTransactionsRepositoryContract {
  createPaymentTransaction(
    input: CreatePaymentTransactionBody,
  ): Promise<PaymentTransactionAggregate>;
  listPaymentTransactions(
    page: number,
    size: number,
    actorUserId?: string,
  ): Promise<PaginatedPaymentTransactionsResult>;
  getPaymentTransactionById(
    paymentId: string,
  ): Promise<PaymentTransactionAggregate | null>;
  processPaymentWebhook(
    input: PaymentWebhookBody,
  ): Promise<PaymentTransactionAggregate | null>;
}

export interface PaymentTransactionsServiceContract {
  createPaymentTransaction(
    input: CreatePaymentTransactionBody,
  ): Promise<PaymentTransactionAggregate>;
  listPaymentTransactions(
    page: number,
    size: number,
    actorUserId: string,
    actorRole: "customer" | "admin",
  ): Promise<PaginatedPaymentTransactionsResult>;
  getPaymentTransactionById(
    paymentId: string,
    actorUserId: string,
    actorRole: "customer" | "admin",
  ): Promise<PaymentTransactionAggregate>;
  processPaymentWebhook(
    input: PaymentWebhookBody,
  ): Promise<PaymentTransactionAggregate>;
}

export class PaymentTransactionsServiceError extends Error {
  constructor(
    public readonly code:
      | "ORDER_NOT_FOUND"
      | "ORDER_ALREADY_FINALIZED"
      | "PAYMENT_IDEMPOTENCY_EXISTS"
      | "WEBHOOK_TRANSACTION_NOT_FOUND"
      | "PAYMENT_NOT_FOUND"
      | "FORBIDDEN"
      | "DATABASE_ERROR",
    message: string,
  ) {
    super(message);
  }
}
