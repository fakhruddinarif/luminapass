import { describe, expect, it } from "bun:test";

import { resolveEventLifecycleStatus } from "../src/utils/event-status";

describe("resolveEventLifecycleStatus", () => {
  const startsAt = new Date("2026-12-10T12:00:00.000Z");
  const endsAt = new Date("2026-12-10T14:00:00.000Z");
  const saleStartsAt = new Date("2026-12-01T00:00:00.000Z");
  const saleEndsAt = new Date("2026-12-09T23:59:59.000Z");

  it("keeps draft unchanged", () => {
    const status = resolveEventLifecycleStatus({
      currentStatus: "draft",
      startsAt,
      endsAt,
      saleStartsAt,
      saleEndsAt,
      totalCapacity: 0,
      sectionCount: 3,
      now: new Date("2026-12-12T00:00:00.000Z"),
    });

    expect(status).toBe("draft");
  });

  it("keeps cancelled unchanged", () => {
    const status = resolveEventLifecycleStatus({
      currentStatus: "cancelled",
      startsAt,
      endsAt,
      saleStartsAt,
      saleEndsAt,
      totalCapacity: 50,
      sectionCount: 3,
      now: new Date("2026-12-10T13:00:00.000Z"),
    });

    expect(status).toBe("cancelled");
  });

  it("marks finished when end time passed", () => {
    const status = resolveEventLifecycleStatus({
      currentStatus: "published",
      startsAt,
      endsAt,
      saleStartsAt,
      saleEndsAt,
      totalCapacity: 50,
      sectionCount: 2,
      now: new Date("2026-12-10T15:00:00.000Z"),
    });

    expect(status).toBe("finished");
  });

  it("transitions live to finished after endsAt", () => {
    const status = resolveEventLifecycleStatus({
      currentStatus: "live",
      startsAt,
      endsAt,
      saleStartsAt,
      saleEndsAt,
      totalCapacity: 10,
      sectionCount: 2,
      now: new Date("2026-12-10T15:00:00.000Z"),
    });

    expect(status).toBe("finished");
  });

  it("marks live during event window", () => {
    const status = resolveEventLifecycleStatus({
      currentStatus: "on_sale",
      startsAt,
      endsAt,
      saleStartsAt,
      saleEndsAt,
      totalCapacity: 0,
      sectionCount: 2,
      now: new Date("2026-12-10T12:30:00.000Z"),
    });

    expect(status).toBe("live");
  });

  it("marks sold_out when sale window is open and capacity is empty", () => {
    const status = resolveEventLifecycleStatus({
      currentStatus: "on_sale",
      startsAt,
      endsAt,
      saleStartsAt,
      saleEndsAt: new Date("2026-12-10T11:59:00.000Z"),
      totalCapacity: 0,
      sectionCount: 2,
      now: new Date("2026-12-09T12:00:00.000Z"),
    });

    expect(status).toBe("sold_out");
  });

  it("marks on_sale when sale window is open and stock exists", () => {
    const status = resolveEventLifecycleStatus({
      currentStatus: "published",
      startsAt,
      endsAt,
      saleStartsAt,
      saleEndsAt,
      totalCapacity: 10,
      sectionCount: 2,
      now: new Date("2026-12-08T12:00:00.000Z"),
    });

    expect(status).toBe("on_sale");
  });

  it("transitions sold_out to on_sale when stock is added in sale window", () => {
    const status = resolveEventLifecycleStatus({
      currentStatus: "sold_out",
      startsAt,
      endsAt,
      saleStartsAt,
      saleEndsAt,
      totalCapacity: 5,
      sectionCount: 2,
      now: new Date("2026-12-08T12:00:00.000Z"),
    });

    expect(status).toBe("on_sale");
  });

  it("marks published when sale window has not started yet", () => {
    const status = resolveEventLifecycleStatus({
      currentStatus: "on_sale",
      startsAt,
      endsAt,
      saleStartsAt,
      saleEndsAt,
      totalCapacity: 10,
      sectionCount: 2,
      now: new Date("2026-11-30T12:00:00.000Z"),
    });

    expect(status).toBe("published");
  });
});
