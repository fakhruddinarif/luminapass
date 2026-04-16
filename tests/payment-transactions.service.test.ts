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

function createRepositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    findOrderByIdTx: async () => ({
      id: "order-1",
      orderCode: "ORD-123",
      status: "awaiting_payment",
      totalAmount: "100000.00",
      suppressTicketEmail: false,
      eventId: "event-1",
    }),
    insertPaymentTransactionTx: async () => ({
      id: "txn-1",
      status: "captured",
      provider: "mock",
      webhookEventId: null,
    }),
    updateOrderAfterPaymentCreateTx: async () => ({
      id: "order-1",
      suppressTicketEmail: false,
    }),
    getPaymentAggregateByTransactionIdTx: async () => ({
      id: "txn-1",
      order: { id: "order-1", items: [], event: null },
    }),
    findTransactionByWebhookInputTx: async () => ({
      id: "txn-1",
      orderId: "order-1",
      provider: "mock",
      settledAt: null,
      failureReason: null,
    }),
    findDuplicateWebhookEventTx: async () => null,
    updatePaymentTransactionTx: async () => ({
      id: "txn-1",
      status: "captured",
      provider: "mock",
      webhookEventId: null,
    }),
    updateOrderAfterWebhookTx: async () => ({
      id: "order-1",
      suppressTicketEmail: false,
    }),
    getOrderItemsWithSectionTx: async () => [],
    listPaymentTransactions: async () => ({
      items: [],
      page: 1,
      size: 10,
      totalItem: 0,
      totalPage: 1,
    }),
    getPaymentTransactionById: async () => null,
    ...overrides,
  };
}

function buildSectionMock() {
  return {
    id: "section-1",
    eventId: "event-1",
    code: "A",
    name: "Section A",
    description: null,
    price: "100000.00",
    capacity: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("PaymentTransactionsService", () => {
  it("creates payment transaction successfully", async () => {
    const service = new PaymentTransactionsService(
      createRepositoryMock() as any,
      {
        synchronizeEventStatusTx: async () => "unchanged",
        enqueueOutboxEventTx: async () => undefined,
        releaseSectionCapacityTx: async () => buildSectionMock(),
        insertStockMovementTx: async () => undefined,
        issueTicketUnitsForPaidOrderTx: async () => 1,
      },
    );
    const result = await service.createPaymentTransaction(createPaymentInput);

    expect(result.id).toBeDefined();
    expect(result.order).toBeDefined();
  });

  it("throws webhook-transaction-not-found when webhook target missing", async () => {
    const repository = createRepositoryMock({
      findTransactionByWebhookInputTx: async () => null,
    });

    const service = new PaymentTransactionsService(repository as any, {
      synchronizeEventStatusTx: async () => "unchanged",
      enqueueOutboxEventTx: async () => undefined,
      releaseSectionCapacityTx: async () => buildSectionMock(),
      insertStockMovementTx: async () => undefined,
      issueTicketUnitsForPaidOrderTx: async () => 1,
    });

    return expect(
      service.processPaymentWebhook(webhookInput),
    ).rejects.toMatchObject({
      code: "WEBHOOK_TRANSACTION_NOT_FOUND",
    });
  });

  it("maps order not found errors during payment creation", async () => {
    const repository = createRepositoryMock({
      findOrderByIdTx: async () => null,
    });

    const service = new PaymentTransactionsService(repository as any, {
      synchronizeEventStatusTx: async () => "unchanged",
      enqueueOutboxEventTx: async () => undefined,
      releaseSectionCapacityTx: async () => buildSectionMock(),
      insertStockMovementTx: async () => undefined,
      issueTicketUnitsForPaidOrderTx: async () => 1,
    });

    return expect(
      service.createPaymentTransaction(createPaymentInput),
    ).rejects.toBeInstanceOf(PaymentTransactionsServiceError);
  });
});
