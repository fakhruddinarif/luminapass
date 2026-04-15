import { describe, expect, it } from "bun:test";

import type {
  CreatePaymentTransactionBody,
  PaymentWebhookBody,
} from "../src/dtos/payment-transactions";
import { PaymentTransactionsService } from "../src/services/payment-transactions.service";
import { PaymentTransactionsServiceError } from "../src/interfaces/payment-transactions.interface";

const createPaymentInput: CreatePaymentTransactionBody = {
  orderId: "11111111-1111-1111-1111-111111111111",
  idempotencyKey: "idem-payment-1234",
  provider: "mock",
};

const webhookInput: PaymentWebhookBody = {
  provider: "mock",
  providerOrderId: "ORD-123",
  status: "captured",
  signatureValid: true,
};

describe("PaymentTransactionsService", () => {
  it("creates payment transaction successfully", async () => {
    const repository = {
      createPaymentTransaction: async () => ({
        transaction: { id: "txn-1" },
        order: { id: "order-1" },
      }),
      processPaymentWebhook: async () => null,
    };

    const service = new PaymentTransactionsService(repository as any);
    const result = await service.createPaymentTransaction(createPaymentInput);

    expect(result.transaction).toBeDefined();
    expect(result.order).toBeDefined();
  });

  it("throws webhook-transaction-not-found when webhook target missing", async () => {
    const repository = {
      createPaymentTransaction: async () => ({
        transaction: { id: "txn-1" },
        order: { id: "order-1" },
      }),
      processPaymentWebhook: async () => null,
    };

    const service = new PaymentTransactionsService(repository as any);

    await expect(
      service.processPaymentWebhook(webhookInput),
    ).rejects.toMatchObject({
      code: "WEBHOOK_TRANSACTION_NOT_FOUND",
    });
  });

  it("maps order not found errors during payment creation", async () => {
    const repository = {
      createPaymentTransaction: async () => {
        throw new Error("ORDER_NOT_FOUND");
      },
      processPaymentWebhook: async () => null,
    };

    const service = new PaymentTransactionsService(repository as any);

    await expect(
      service.createPaymentTransaction(createPaymentInput),
    ).rejects.toBeInstanceOf(PaymentTransactionsServiceError);
  });
});
