import { describe, expect, it } from "bun:test";

import { TicketOrdersController } from "../src/controllers/ticket-orders.controller";

function buildContext(request?: Request) {
  return {
    set: {
      status: 200,
      headers: {},
    },
    request: request ?? new Request("http://localhost/api/ticket-orders"),
    jwt: {
      sign: async () => "token",
      verify: async () => ({ sub: "user-1" }),
    },
  };
}

describe("TicketOrdersController", () => {
  it("createTicketOrder returns 401 when no auth cookie", async () => {
    const service = {
      createTicketOrder: async () => ({ id: "order-1", items: [] }),
      listTicketOrders: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getTicketOrderById: async () => ({ id: "order-1", items: [] }),
    };

    const controller = new TicketOrdersController(service as any);
    const response = await controller.createTicketOrder(
      {
        eventId: "event-1",
        idempotencyKey: "idem-1",
        items: [{ eventSectionId: "section-1", quantity: 1 }],
        paymentProvider: "mock",
      },
      buildContext(),
    );

    expect(response.status).toBe(401);
    expect(response.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("getTicketOrderById returns 401 when no auth cookie", async () => {
    const service = {
      createTicketOrder: async () => ({ id: "order-1", items: [] }),
      listTicketOrders: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getTicketOrderById: async () => ({ id: "order-1", items: [] }),
    };

    const controller = new TicketOrdersController(service as any);
    const response = await controller.getTicketOrderById(
      "order-1",
      buildContext(new Request("http://localhost/api/ticket-orders/order-1")),
    );

    expect(response.status).toBe(401);
    expect(response.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("listTicketOrders returns 401 when no auth cookie", async () => {
    const service = {
      createTicketOrder: async () => ({ id: "order-1", items: [] }),
      listTicketOrders: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getTicketOrderById: async () => ({ id: "order-1", items: [] }),
    };

    const controller = new TicketOrdersController(service as any);
    const response = await controller.listTicketOrders(
      { page: 1, size: 10 },
      buildContext(
        new Request("http://localhost/api/ticket-orders?page=1&size=10"),
      ),
    );

    expect(response.status).toBe(401);
    expect(response.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });
});
