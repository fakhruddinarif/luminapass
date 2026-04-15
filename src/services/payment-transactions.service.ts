import { DatabaseError } from "pg";

import type {
  CreatePaymentTransactionBody,
  PaymentWebhookBody,
} from "../dtos/payment-transactions";
import {
  PaymentTransactionsServiceError,
  type PaymentTransactionAggregate,
  type PaymentTransactionsRepositoryContract,
  type PaymentTransactionsServiceContract,
} from "../interfaces/payment-transactions.interface";
import { paymentTransactionsRepository } from "../repositories/payment-transactions.repository";

function mapPaymentDatabaseError(error: unknown): never {
  if (error instanceof DatabaseError && error.code === "23505") {
    throw new PaymentTransactionsServiceError(
      "PAYMENT_IDEMPOTENCY_EXISTS",
      "Payment idempotency key already exists",
    );
  }

  if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
    throw new PaymentTransactionsServiceError(
      "ORDER_NOT_FOUND",
      "Order was not found",
    );
  }

  if (error instanceof Error && error.message === "ORDER_ALREADY_FINALIZED") {
    throw new PaymentTransactionsServiceError(
      "ORDER_ALREADY_FINALIZED",
      "Order is already in a final state",
    );
  }

  throw new PaymentTransactionsServiceError(
    "DATABASE_ERROR",
    "A database error occurred while processing payment",
  );
}

export class PaymentTransactionsService implements PaymentTransactionsServiceContract {
  constructor(
    private readonly repository: PaymentTransactionsRepositoryContract,
  ) {}

  async createPaymentTransaction(
    input: CreatePaymentTransactionBody,
  ): Promise<PaymentTransactionAggregate> {
    try {
      return await this.repository.createPaymentTransaction(input);
    } catch (error) {
      mapPaymentDatabaseError(error);
    }
  }

  async processPaymentWebhook(
    input: PaymentWebhookBody,
  ): Promise<PaymentTransactionAggregate> {
    try {
      const result = await this.repository.processPaymentWebhook(input);
      if (!result) {
        throw new PaymentTransactionsServiceError(
          "WEBHOOK_TRANSACTION_NOT_FOUND",
          "Matching transaction for webhook payload was not found",
        );
      }

      return result;
    } catch (error) {
      if (error instanceof PaymentTransactionsServiceError) {
        throw error;
      }

      mapPaymentDatabaseError(error);
    }
  }
}

export const paymentTransactionsService = new PaymentTransactionsService(
  paymentTransactionsRepository,
);
