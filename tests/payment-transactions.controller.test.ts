import { describe, expect, it } from "bun:test";

import { PaymentTransactionsController } from "../src/controllers/payment-transactions.controller";
import { PaymentTransactionsServiceError } from "../src/interfaces/payment-transactions.interface";

function buildContext(request?: Request) {
  return {
    set: {
      status: 200,
      headers: {},
    },
    request:
      request ?? new Request("http://localhost/api/payment-transactions"),
    jwt: {
      sign: async () => "token",
      verify: async () => ({ sub: "user-1" }),
    },
  };
}

describe("PaymentTransactionsController", () => {
  it("createPaymentTransaction returns 401 when no auth cookie", async () => {
    const service = {
      createPaymentTransaction: async () => ({ id: "pay-1", order: null }),
      listPaymentTransactions: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getPaymentTransactionById: async () => ({ id: "pay-1", order: null }),
      processPaymentWebhook: async () => ({ id: "pay-1", order: null }),
    };

    const controller = new PaymentTransactionsController(service as any);
    const response = await controller.createPaymentTransaction(
      {
        orderId: "order-1",
        idempotencyKey: "idem-1",
        provider: "mock",
      },
      buildContext(),
    );

    expect(response.status).toBe(401);
    expect(response.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("processPaymentWebhook returns 200 on success", async () => {
    const service = {
      createPaymentTransaction: async () => ({ id: "pay-1", order: null }),
      listPaymentTransactions: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getPaymentTransactionById: async () => ({ id: "pay-1", order: null }),
      processPaymentWebhook: async () => ({ id: "pay-1", order: null }),
    };

    const controller = new PaymentTransactionsController(service as any);
    const response = await controller.processPaymentWebhook(
      {
        provider: "mock",
        providerOrderId: "ORD-123",
        status: "captured",
        signatureValid: true,
      },
      buildContext(
        new Request("http://localhost/api/payment-transactions/webhook"),
      ),
    );

    expect(response.status).toBe(200);
    expect(response.errors).toBeNull();
    expect((response.data as any).id).toBe("pay-1");
  });

  it("processPaymentWebhook maps domain error to 404", async () => {
    const service = {
      createPaymentTransaction: async () => ({ id: "pay-1", order: null }),
      listPaymentTransactions: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getPaymentTransactionById: async () => ({ id: "pay-1", order: null }),
      processPaymentWebhook: async () => {
        throw new PaymentTransactionsServiceError(
          "WEBHOOK_TRANSACTION_NOT_FOUND",
          "Not found",
        );
      },
    };

    const controller = new PaymentTransactionsController(service as any);
    const response = await controller.processPaymentWebhook(
      {
        provider: "mock",
        providerOrderId: "ORD-123",
        status: "captured",
        signatureValid: true,
      },
      buildContext(
        new Request("http://localhost/api/payment-transactions/webhook"),
      ),
    );

    expect(response.status).toBe(404);
    expect(response.errors?.[0]?.code).toBe("WEBHOOK_TRANSACTION_NOT_FOUND");
  });
});
