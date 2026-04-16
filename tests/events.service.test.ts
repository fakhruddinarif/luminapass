import { describe, expect, it } from "bun:test";

import type { CreateEventBody } from "../src/dtos/admin";
import { EventsService } from "../src/services/events.service";
import { EventsServiceError } from "../src/interfaces/events.interface";

const actorUserId = "efb149f4-875e-4ab8-b2aa-ef22daf1ca07";

function buildCreateEventInput(): CreateEventBody {
  return {
    slug: "konser-akbar-2026",
    name: "Konser Akbar 2026",
    description: "Concert event",
    venueName: "Main Stadium",
    venueCity: "Jakarta",
    venueAddress: "Sudirman Street",
    startsAt: new Date("2026-10-10T19:00:00.000Z"),
    endsAt: new Date("2026-10-10T22:00:00.000Z"),
    saleStartsAt: new Date("2026-08-01T00:00:00.000Z"),
    saleEndsAt: new Date("2026-10-09T23:59:59.000Z"),
    sections: [
      {
        code: "A",
        name: "Festival A",
        price: 350000,
        capacity: 100,
      },
    ],
  };
}

function createRepositoryMock(overrides: Record<string, unknown> = {}) {
  return {
    listEvents: async () => ({
      items: [],
      page: 1,
      size: 10,
      totalItem: 0,
      totalPage: 1,
    }),
    getEventById: async () => null,
    getEventBySlug: async () => null,
    getLiveDashboard: async () => ({
      waitingUsers: 0,
      soldTickets: 0,
      activeViewers: 0,
      totalCapacity: 0,
      topResolutions: [],
    }),
    getEventByIdTx: async () => ({
      id: "event-1",
      slug: "event-1",
      status: "draft",
      sections: [],
    }),
    getEventBySlugTx: async () => null,
    insertEventTx: async () => ({ id: "event-1" }),
    insertEventSectionsTx: async () => [],
    updateEventByIdTx: async () => ({ id: "event-1", name: "Updated" }),
    findEventSectionTx: async () => ({ id: "section-1", capacity: 10 }),
    updateEventSectionCapacityTx: async () => ({
      id: "section-1",
      capacity: 12,
    }),
    insertStockMovementTx: async () => ({ id: "movement-1" }),
    listAutoManagedEventsTx: async () => [],
    synchronizeEventStatusTx: async () => "unchanged",
    ...overrides,
  };
}

describe("EventsService", () => {
  it("returns events list with sections", async () => {
    const repository = createRepositoryMock({
      listEvents: async () => ({
        items: [{ id: "event-1", sections: [{ id: "section-1" }] }],
        page: 1,
        size: 10,
        totalItem: 1,
        totalPage: 1,
      }),
    });

    const service = new EventsService(repository as any);
    const result = await service.listEvents(1, 10, "konser");

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.sections).toHaveLength(1);
    expect(result.totalItem).toBe(1);
  });

  it("throws EVENT_NOT_FOUND when event detail by slug is missing", async () => {
    const repository = createRepositoryMock();
    const service = new EventsService(repository as any);

    await expect(service.getEventBySlug("missing-slug")).rejects.toMatchObject({
      code: "EVENT_NOT_FOUND",
    });
  });

  it("creates event with valid time range", async () => {
    const repository = createRepositoryMock({
      insertEventTx: async () => ({ id: "event-created" }),
      getEventByIdTx: async () => ({
        id: "event-created",
        slug: "konser-akbar-2026",
        status: "draft",
      }),
      insertEventSectionsTx: async () => [{ id: "section-a" }],
    });

    const service = new EventsService(repository as any);
    const result = await service.createEvent(
      actorUserId,
      buildCreateEventInput(),
    );

    expect((result as any).id).toBe("event-created");
  });

  it("throws INVALID_TIME_RANGE when event ends before start", async () => {
    const service = new EventsService(createRepositoryMock() as any);

    const input = buildCreateEventInput();
    input.endsAt = new Date("2026-10-10T18:00:00.000Z");

    await expect(service.createEvent(actorUserId, input)).rejects.toMatchObject(
      {
        code: "INVALID_TIME_RANGE",
      },
    );
  });

  it("maps non-domain errors into EventsServiceError", async () => {
    const repository = createRepositoryMock({
      insertEventTx: async () => {
        throw new Error("random failure");
      },
    });

    const service = new EventsService(repository as any);

    await expect(
      service.createEvent(actorUserId, buildCreateEventInput()),
    ).rejects.toBeInstanceOf(EventsServiceError);
  });
});
