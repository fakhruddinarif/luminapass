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

describe("TicketOrdersService", () => {
  it("creates ticket order successfully", async () => {
    const repository = {
      createTicketOrder: async () => ({
        id: "order-1",
        items: [{ id: "item-1" }],
        event: null,
        user: null,
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
    };

    const service = new TicketOrdersService(repository as any);
    const result = await service.createTicketOrder("user-1", orderInput);

    expect(result.id).toBeDefined();
    expect(Array.isArray(result.payments)).toBe(true);
  });

  it("throws ORDER_NOT_FOUND when reading missing order", async () => {
    const repository = {
      createTicketOrder: async () => ({
        id: "order-1",
        items: [],
        event: null,
        user: null,
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
    };

    const service = new TicketOrdersService(repository as any);

    return expect(
      service.getTicketOrderById("missing-id", "user-1", "customer"),
    ).rejects.toBeInstanceOf(TicketOrdersServiceError);
  });

  it("maps domain event-not-found errors", async () => {
    const repository = {
      createTicketOrder: async () => {
        throw new Error("EVENT_NOT_FOUND");
      },
      listTicketOrders: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getTicketOrderById: async () => null,
    };

    const service = new TicketOrdersService(repository as any);

    return expect(
      service.createTicketOrder("user-1", orderInput),
    ).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
  });

  it("maps event-not-on-sale errors", async () => {
    const repository = {
      createTicketOrder: async () => {
        throw new Error("EVENT_NOT_ON_SALE");
      },
      listTicketOrders: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getTicketOrderById: async () => null,
    };

    const service = new TicketOrdersService(repository as any);

    return expect(
      service.createTicketOrder("user-1", orderInput),
    ).rejects.toMatchObject({
      code: "EVENT_NOT_ON_SALE",
    });
  });
});
