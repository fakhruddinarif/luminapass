import type {
  CreatePaymentTransactionBody,
  PaymentWebhookBody,
} from "../dtos/payment-transactions";
import type { paymentTransactions, ticketOrders } from "../entities";

export type PaymentTransactionRow = typeof paymentTransactions.$inferSelect;
export type TicketOrderRow = typeof ticketOrders.$inferSelect;

export interface PaymentTransactionAggregate {
  transaction: PaymentTransactionRow;
  order: TicketOrderRow;
}

export interface PaymentTransactionsRepositoryContract {
  createPaymentTransaction(
    input: CreatePaymentTransactionBody,
  ): Promise<PaymentTransactionAggregate>;
  processPaymentWebhook(
    input: PaymentWebhookBody,
  ): Promise<PaymentTransactionAggregate | null>;
}

export interface PaymentTransactionsServiceContract {
  createPaymentTransaction(
    input: CreatePaymentTransactionBody,
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
      | "DATABASE_ERROR",
    message: string,
  ) {
    super(message);
  }
}
