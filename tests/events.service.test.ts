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

describe("EventsService", () => {
  it("creates event with valid time range", async () => {
    const repository = {
      createEventWithSections: async () => ({ ok: true }),
      updateEvent: async () => ({ ok: true }),
      overrideSectionCapacity: async () => ({ ok: true }),
      getLiveDashboard: async () => ({
        waitingUsers: 1,
        soldTickets: 2,
        activeViewers: 3,
        totalCapacity: 4,
        topResolutions: [],
      }),
    };

    const service = new EventsService(repository);
    const result = await service.createEvent(
      actorUserId,
      buildCreateEventInput(),
    );

    expect(result).toEqual({ ok: true });
  });

  it("throws INVALID_TIME_RANGE when event ends before start", async () => {
    const repository = {
      createEventWithSections: async () => ({ ok: true }),
      updateEvent: async () => ({ ok: true }),
      overrideSectionCapacity: async () => ({ ok: true }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const service = new EventsService(repository);

    const input = buildCreateEventInput();
    input.endsAt = new Date("2026-10-10T18:00:00.000Z");

    await expect(service.createEvent(actorUserId, input)).rejects.toMatchObject(
      {
        code: "INVALID_TIME_RANGE",
      },
    );
  });

  it("throws EVENT_NOT_FOUND when update target does not exist", async () => {
    const repository = {
      createEventWithSections: async () => ({ ok: true }),
      updateEvent: async () => null,
      overrideSectionCapacity: async () => ({ ok: true }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const service = new EventsService(repository);

    await expect(
      service.updateEvent("00000000-0000-0000-0000-000000000001", actorUserId, {
        name: "Updated",
      }),
    ).rejects.toMatchObject({ code: "EVENT_NOT_FOUND" });
  });

  it("throws INVALID_STOCK_OVERRIDE when resulting capacity is negative", async () => {
    const repository = {
      createEventWithSections: async () => ({ ok: true }),
      updateEvent: async () => ({ ok: true }),
      overrideSectionCapacity: async () => {
        throw new Error("NEGATIVE_CAPACITY");
      },
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const service = new EventsService(repository);

    await expect(
      service.instantStockOverride(
        "00000000-0000-0000-0000-000000000001",
        "00000000-0000-0000-0000-000000000002",
        actorUserId,
        { action: "withdraw", quantity: 10, reason: "rollback" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_STOCK_OVERRIDE" });
  });

  it("returns live dashboard metrics", async () => {
    const repository = {
      createEventWithSections: async () => ({ ok: true }),
      updateEvent: async () => ({ ok: true }),
      overrideSectionCapacity: async () => ({ ok: true }),
      getLiveDashboard: async () => ({
        waitingUsers: 10,
        soldTickets: 120,
        activeViewers: 85,
        totalCapacity: 500,
        topResolutions: [
          { resolution: "720p" as const, count: 50 },
          { resolution: "1080p" as const, count: 25 },
        ],
      }),
    };

    const service = new EventsService(repository);
    const result = await service.getLiveDashboard({
      eventId: "00000000-0000-0000-0000-000000000001",
      topResolutionLimit: 2,
    });

    expect(result.waitingUsers).toBe(10);
    expect(result.topResolutions).toHaveLength(2);
  });

  it("maps non-domain errors into EventsServiceError", async () => {
    const repository = {
      createEventWithSections: async () => {
        throw new Error("random failure");
      },
      updateEvent: async () => ({ ok: true }),
      overrideSectionCapacity: async () => ({ ok: true }),
      getLiveDashboard: async () => ({
        waitingUsers: 0,
        soldTickets: 0,
        activeViewers: 0,
        totalCapacity: 0,
        topResolutions: [],
      }),
    };

    const service = new EventsService(repository);

    await expect(
      service.createEvent(actorUserId, buildCreateEventInput()),
    ).rejects.toBeInstanceOf(EventsServiceError);
  });
});
