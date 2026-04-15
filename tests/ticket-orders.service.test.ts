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
        order: { id: "order-1" },
        items: [{ id: "item-1" }],
      }),
      getTicketOrderById: async () => null,
    };

    const service = new TicketOrdersService(repository as any);
    const result = await service.createTicketOrder("user-1", orderInput);

    expect(result.order).toBeDefined();
    expect(result.items).toHaveLength(1);
  });

  it("throws ORDER_NOT_FOUND when reading missing order", async () => {
    const repository = {
      createTicketOrder: async () => ({
        order: { id: "order-1" },
        items: [],
      }),
      getTicketOrderById: async () => null,
    };

    const service = new TicketOrdersService(repository as any);

    await expect(
      service.getTicketOrderById("missing-id"),
    ).rejects.toBeInstanceOf(TicketOrdersServiceError);
  });

  it("maps domain event-not-found errors", async () => {
    const repository = {
      createTicketOrder: async () => {
        throw new Error("EVENT_NOT_FOUND");
      },
      getTicketOrderById: async () => null,
    };

    const service = new TicketOrdersService(repository as any);

    await expect(
      service.createTicketOrder("user-1", orderInput),
    ).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
  });
});
