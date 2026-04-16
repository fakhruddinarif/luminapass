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
        id: "txn-1",
        order: { id: "order-1", items: [], event: null },
      }),
      listPaymentTransactions: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getPaymentTransactionById: async () => null,
      processPaymentWebhook: async () => null,
    };

    const service = new PaymentTransactionsService(repository as any);
    const result = await service.createPaymentTransaction(createPaymentInput);

    expect(result.id).toBeDefined();
    expect(result.order).toBeDefined();
  });

  it("throws webhook-transaction-not-found when webhook target missing", async () => {
    const repository = {
      createPaymentTransaction: async () => ({
        id: "txn-1",
        order: { id: "order-1", items: [], event: null },
      }),
      listPaymentTransactions: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getPaymentTransactionById: async () => null,
      processPaymentWebhook: async () => null,
    };

    const service = new PaymentTransactionsService(repository as any);

    return expect(
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
      listPaymentTransactions: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getPaymentTransactionById: async () => null,
      processPaymentWebhook: async () => null,
    };

    const service = new PaymentTransactionsService(repository as any);

    return expect(
      service.createPaymentTransaction(createPaymentInput),
    ).rejects.toBeInstanceOf(PaymentTransactionsServiceError);
  });
});
