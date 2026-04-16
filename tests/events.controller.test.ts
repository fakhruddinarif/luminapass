import { describe, expect, it } from "bun:test";

import { EventsController } from "../src/controllers/events.controller";
import { EventsServiceError } from "../src/interfaces/events.interface";

function buildContext() {
  return {
    set: {
      status: 200,
      headers: {},
    },
    request: new Request("http://localhost/api/events"),
    jwt: {} as any,
  };
}

describe("EventsController", () => {
  it("listEvents returns 200 on success", async () => {
    const service = {
      listEvents: async () => ({
        items: [{ id: "event-1", sections: [] }],
        page: 1,
        size: 10,
        totalItem: 21,
        totalPage: 3,
      }),
      getEventById: async () => ({ id: "event-1", sections: [] }),
      getEventBySlug: async () => ({ id: "event-1", sections: [] }),
      createEvent: async () => ({ id: "event-1", sections: [] }),
      updateEvent: async () => ({ id: "event-1" }),
      instantStockOverride: async () => ({ section: {}, movement: {} }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const controller = new EventsController(service as any);
    const context = buildContext();
    const response = await controller.listEvents(
      { page: 1, size: 10, search: "konser" },
      context,
    );

    expect(context.set.status).toBe(200);
    expect(response.status).toBe(200);
    expect(response.data).toHaveLength(1);
    expect(response.meta).toEqual({
      page: 1,
      size: 10,
      total_page: 3,
      total_item: 21,
    });
  });

  it("listEvents maps service domain error to HTTP 404", async () => {
    const service = {
      listEvents: async () => {
        throw new EventsServiceError("EVENT_NOT_FOUND", "Event was not found");
      },
      getEventById: async () => ({ id: "event-1", sections: [] }),
      getEventBySlug: async () => ({ id: "event-1", sections: [] }),
      createEvent: async () => ({ id: "event-1", sections: [] }),
      updateEvent: async () => ({ id: "event-1" }),
      instantStockOverride: async () => ({ section: {}, movement: {} }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const controller = new EventsController(service as any);
    const context = buildContext();
    const response = await controller.listEvents(
      { page: 1, size: 10 },
      context,
    );

    expect(context.set.status).toBe(404);
    expect(response.status).toBe(404);
    expect(response.errors?.[0]?.code).toBe("EVENT_NOT_FOUND");
  });

  it("getEventById returns 200 on success", async () => {
    const service = {
      listEvents: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getEventById: async () => ({ id: "event-123", sections: [] }),
      getEventBySlug: async () => ({ id: "event-1", sections: [] }),
      createEvent: async () => ({ id: "event-1", sections: [] }),
      updateEvent: async () => ({ id: "event-1" }),
      instantStockOverride: async () => ({ section: {}, movement: {} }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const controller = new EventsController(service as any);
    const context = buildContext();
    const response = await controller.getEventById("event-123", context);

    expect(context.set.status).toBe(200);
    expect(response.status).toBe(200);
    expect((response.data as any).id).toBe("event-123");
  });

  it("getEventById maps unexpected error to HTTP 500", async () => {
    const service = {
      listEvents: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getEventById: async () => {
        throw new Error("db down");
      },
      getEventBySlug: async () => ({ id: "event-1", sections: [] }),
      createEvent: async () => ({ id: "event-1", sections: [] }),
      updateEvent: async () => ({ id: "event-1" }),
      instantStockOverride: async () => ({ section: {}, movement: {} }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const controller = new EventsController(service as any);
    const context = buildContext();
    const response = await controller.getEventById("event-123", context);

    expect(context.set.status).toBe(500);
    expect(response.status).toBe(500);
    expect(response.errors?.[0]?.code).toBe("UNEXPECTED_ERROR");
  });

  it("getEventBySlug returns 200 on success", async () => {
    const service = {
      listEvents: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getEventById: async () => ({ id: "event-1", sections: [] }),
      getEventBySlug: async () => ({
        id: "event-1",
        slug: "konser-1",
        sections: [],
      }),
      createEvent: async () => ({ id: "event-1", sections: [] }),
      updateEvent: async () => ({ id: "event-1" }),
      instantStockOverride: async () => ({ section: {}, movement: {} }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const controller = new EventsController(service as any);
    const context = buildContext();
    const response = await controller.getEventBySlug("konser-1", context);

    expect(context.set.status).toBe(200);
    expect(response.status).toBe(200);
    expect((response.data as any).slug).toBe("konser-1");
  });

  it("getEventBySlug maps service domain error to HTTP 404", async () => {
    const service = {
      listEvents: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getEventById: async () => ({ id: "event-1", sections: [] }),
      getEventBySlug: async () => {
        throw new EventsServiceError("EVENT_NOT_FOUND", "Event was not found");
      },
      createEvent: async () => ({ id: "event-1", sections: [] }),
      updateEvent: async () => ({ id: "event-1" }),
      instantStockOverride: async () => ({ section: {}, movement: {} }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const controller = new EventsController(service as any);
    const context = buildContext();
    const response = await controller.getEventBySlug("missing", context);

    expect(context.set.status).toBe(404);
    expect(response.status).toBe(404);
    expect(response.errors?.[0]?.code).toBe("EVENT_NOT_FOUND");
  });

  it("createEvent returns 401 when no auth cookie", async () => {
    const service = {
      listEvents: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getEventById: async () => ({ id: "event-1", sections: [] }),
      getEventBySlug: async () => ({ id: "event-1", sections: [] }),
      createEvent: async () => ({ id: "event-1", sections: [] }),
      updateEvent: async () => ({ id: "event-1" }),
      instantStockOverride: async () => ({ section: {}, movement: {} }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const controller = new EventsController(service as any);
    const context = buildContext();
    const response = await controller.createEvent(
      {
        slug: "konser-akbar-2026",
        name: "Konser Akbar 2026",
        venueName: "Main Stadium",
        venueCity: "Jakarta",
        startsAt: new Date("2026-10-10T19:00:00.000Z"),
        saleStartsAt: new Date("2026-08-01T00:00:00.000Z"),
        sections: [],
      },
      context,
    );

    expect(response.status).toBe(401);
    expect(response.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("updateEvent returns 401 when no auth cookie", async () => {
    const service = {
      listEvents: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getEventById: async () => ({ id: "event-1", sections: [] }),
      getEventBySlug: async () => ({ id: "event-1", sections: [] }),
      createEvent: async () => ({ id: "event-1", sections: [] }),
      updateEvent: async () => ({ id: "event-1" }),
      instantStockOverride: async () => ({ section: {}, movement: {} }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const controller = new EventsController(service as any);
    const context = buildContext();
    const response = await controller.updateEvent(
      "event-1",
      { name: "Updated" },
      context,
    );

    expect(response.status).toBe(401);
    expect(response.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("instantStockOverride returns 401 when no auth cookie", async () => {
    const service = {
      listEvents: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getEventById: async () => ({ id: "event-1", sections: [] }),
      getEventBySlug: async () => ({ id: "event-1", sections: [] }),
      createEvent: async () => ({ id: "event-1", sections: [] }),
      updateEvent: async () => ({ id: "event-1" }),
      instantStockOverride: async () => ({ section: {}, movement: {} }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const controller = new EventsController(service as any);
    const context = buildContext();
    const response = await controller.instantStockOverride(
      "event-1",
      "section-1",
      { action: "add", quantity: 1, reason: "sync" },
      context,
    );

    expect(response.status).toBe(401);
    expect(response.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });

  it("liveDashboard returns 401 when no auth cookie", async () => {
    const service = {
      listEvents: async () => ({
        items: [],
        page: 1,
        size: 10,
        totalItem: 0,
        totalPage: 1,
      }),
      getEventById: async () => ({ id: "event-1", sections: [] }),
      getEventBySlug: async () => ({ id: "event-1", sections: [] }),
      createEvent: async () => ({ id: "event-1", sections: [] }),
      updateEvent: async () => ({ id: "event-1" }),
      instantStockOverride: async () => ({ section: {}, movement: {} }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const controller = new EventsController(service as any);
    const context = buildContext();
    const response = await controller.liveDashboard({}, context);

    expect(response.status).toBe(401);
    expect(response.errors?.[0]?.code).toBe("UNAUTHORIZED");
  });
});
