import { describe, expect, it } from "bun:test";

import type { CreateTicketOrderBody } from "../src/dtos/ticket-orders";
import { TicketOrdersService } from "../src/services/ticket-orders.service";
import { TicketOrdersServiceError } from "../src/interfaces/ticket-orders.interface";

const orderInput: CreateTicketOrderBody = {
  eventId: "11111111-1111-1111-1111-111111111111",
  idempotencyKey: "idem-ticket-order-1234",
  items: [
    {
      eventSectionId: "22222222-2222-2222-2222-222222222222",
      quantity: 2,
    },
  ],
};

function createRepositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    findEventByIdTx: async () => ({ id: "event-1", status: "on_sale" }),
    findEventSectionsByIdsTx: async () => [
      {
        id: "section-1",
        code: "A",
        name: "A",
        price: "100000.00",
      },
    ],
    makeOrderCode: () => "ORD-TEST-0001",
    insertTicketOrderTx: async () => ({
      id: "order-1",
      orderCode: "ORD-TEST-0001",
      eventId: "event-1",
      userId: "user-1",
      status: "awaiting_payment",
    }),
    insertTicketOrderItemsTx: async () => [{ id: "item-1" }],
    reserveSectionCapacityTx: async () => ({ capacity: 98 }),
    insertStockMovementTx: async () => undefined,
    getTicketOrderByIdWithPaymentsTx: async () => ({
      id: "order-1",
      payments: [],
    }),
    listTicketOrders: async () => ({
      items: [],
      page: 1,
      size: 10,
      totalItem: 0,
      totalPage: 1,
    }),
    getTicketOrderById: async () => null,
    scanTicketUnitByCode: async () => ({
      id: "ticket-1",
      ticketCode: "TK-001",
      orderId: "order-1",
      eventId: "event-1",
      eventSectionId: "section-1",
      usedAt: new Date(),
    }),
    ...overrides,
  };
}

describe("TicketOrdersService", () => {
  it("creates ticket order successfully", async () => {
    const service = new TicketOrdersService(createRepositoryMock() as any, {
      synchronizeEventStatusTx: async () => "unchanged",
      enqueueOutboxEventTx: async () => undefined,
    });
    const result = await service.createTicketOrder("user-1", orderInput);

    expect(result.id).toBeDefined();
    expect(Array.isArray(result.payments)).toBe(true);
  });

  it("throws ORDER_NOT_FOUND when reading missing order", async () => {
    const repository = createRepositoryMock({
      getTicketOrderById: async () => null,
    });

    const service = new TicketOrdersService(repository as any);

    return expect(
      service.getTicketOrderById("missing-id", "user-1", "customer"),
    ).rejects.toBeInstanceOf(TicketOrdersServiceError);
  });

  it("maps domain event-not-found errors", async () => {
    const repository = createRepositoryMock({
      findEventByIdTx: async () => null,
    });

    const service = new TicketOrdersService(repository as any, {
      synchronizeEventStatusTx: async () => "unchanged",
      enqueueOutboxEventTx: async () => undefined,
    });

    return expect(
      service.createTicketOrder("user-1", orderInput),
    ).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
  });

  it("maps event-not-on-sale errors", async () => {
    const repository = createRepositoryMock({
      findEventByIdTx: async () => ({ id: "event-1", status: "draft" }),
    });

    const service = new TicketOrdersService(repository as any, {
      synchronizeEventStatusTx: async () => "unchanged",
      enqueueOutboxEventTx: async () => undefined,
    });

    return expect(
      service.createTicketOrder("user-1", orderInput),
    ).rejects.toMatchObject({
      code: "EVENT_NOT_ON_SALE",
    });
  });
});
