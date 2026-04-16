import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "../config/db";
import {
  eventSections,
  eventStatusEnum,
  events,
  stockMovements,
  streamSessions,
  waitingRoomJobs,
} from "../entities";
import type {
  EventsRepositoryContract,
  LiveDashboardMetrics,
  TopResolutionMetric,
} from "../interfaces/events.interface";
import { resolveEventLifecycleStatus } from "../utils/event-status";

function toNullableDate(date?: Date): Date | null {
  return date ?? null;
}

type EventStatus = (typeof eventStatusEnum.enumValues)[number];

function parseEventStatus(input?: string): EventStatus | undefined {
  if (!input) {
    return undefined;
  }

  const normalized = input.trim().toLowerCase();

  return (eventStatusEnum.enumValues as readonly string[]).includes(normalized)
    ? (normalized as EventStatus)
    : undefined;
}

type EventStatusSyncResult = "updated" | "unchanged" | "not_found";

const AUTO_MANAGED_EVENT_STATUSES: EventStatus[] = [
  "published",
  "on_sale",
  "sold_out",
  "live",
  "finished",
];

async function getSectionStatsByEventId(tx: any, eventId: string) {
  const [row] = await tx
    .select({
      sectionCount: sql<number>`cast(count(*) as int)`,
      totalCapacity: sql<number>`coalesce(cast(sum(${eventSections.capacity}) as int), 0)`,
    })
    .from(eventSections)
    .where(eq(eventSections.eventId, eventId));

  return {
    sectionCount: row?.sectionCount ?? 0,
    totalCapacity: row?.totalCapacity ?? 0,
  };
}

export async function synchronizeEventStatusTx(
  tx: any,
  eventId: string,
  now = new Date(),
): Promise<EventStatusSyncResult> {
  const event = await tx.query.events.findFirst({
    where: eq(events.id, eventId),
  });

  if (!event) {
    return "not_found";
  }

  const sectionStats = await getSectionStatsByEventId(tx, eventId);

  const nextStatus = resolveEventLifecycleStatus({
    currentStatus: event.status,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    saleStartsAt: event.saleStartsAt,
    saleEndsAt: event.saleEndsAt,
    totalCapacity: sectionStats.totalCapacity,
    sectionCount: sectionStats.sectionCount,
    now,
  });

  if (nextStatus === event.status) {
    return "unchanged";
  }

  await tx
    .update(events)
    .set({
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(events.id, eventId));

  return "updated";
}

export async function synchronizeEventStatus(
  eventId: string,
  now = new Date(),
): Promise<void> {
  await db.transaction(async (tx) => {
    await synchronizeEventStatusTx(tx, eventId, now);
  });
}

export async function synchronizeAutoEventStatuses(
  limit = 200,
): Promise<number> {
  return db.transaction(async (tx) => {
    const candidates = await tx.query.events.findMany({
      where: inArray(events.status, AUTO_MANAGED_EVENT_STATUSES),
      limit,
      orderBy: desc(events.updatedAt),
    });

    const now = new Date();
    let updatedCount = 0;

    for (const event of candidates) {
      const result = await synchronizeEventStatusTx(tx, event.id, now);
      if (result === "updated") {
        updatedCount += 1;
      }
    }

    return updatedCount;
  });
}

export const eventsRepository: EventsRepositoryContract = {
  async listEvents(
    page: number,
    size: number,
    search?: string,
    filterStatus?: string,
  ) {
    const pageQuery = Math.max(1, page);
    const sizeQuery = Math.max(1, Math.min(100, size));
    const offset = (pageQuery - 1) * sizeQuery;
    const normalizedSearch = search?.trim();
    const normalizedStatus = parseEventStatus(filterStatus);

    const keywordClause = normalizedSearch
      ? or(
          ilike(events.slug, `%${normalizedSearch}%`),
          ilike(events.name, `%${normalizedSearch}%`),
          ilike(events.description, `%${normalizedSearch}%`),
          ilike(events.venueName, `%${normalizedSearch}%`),
          ilike(events.venueCity, `%${normalizedSearch}%`),
          ilike(events.venueAddress, `%${normalizedSearch}%`),
        )
      : undefined;

    const statusClause = normalizedStatus
      ? eq(events.status, normalizedStatus)
      : undefined;

    const whereClause =
      statusClause && keywordClause
        ? or(statusClause, keywordClause)
        : (statusClause ?? keywordClause);

    const eventsList = await db.query.events.findMany({
      where: whereClause,
      orderBy: desc(events.createdAt),
      limit: sizeQuery,
      offset: offset,
      with: {
        sections: true,
      },
    });

    const [countRow] = whereClause
      ? await db
          .select({
            count: sql<number>`cast(count(*) as int)`,
          })
          .from(events)
          .where(whereClause)
      : await db
          .select({
            count: sql<number>`cast(count(*) as int)`,
          })
          .from(events);

    const totalItem = countRow?.count ?? 0;
    const totalPage = Math.max(1, Math.ceil(totalItem / sizeQuery));

    return {
      items: eventsList,
      page: pageQuery,
      size: sizeQuery,
      totalItem,
      totalPage,
    };
  },

  async getEventById(eventId) {
    const eventWithSections = await db.query.events.findFirst({
      where: eq(events.id, eventId),
      with: {
        sections: true,
      },
    });

    if (!eventWithSections) {
      return null;
    }

    return eventWithSections;
  },

  async getEventBySlug(slug) {
    const eventWithSections = await db.query.events.findFirst({
      where: eq(events.slug, slug),
      with: {
        sections: true,
      },
    });

    if (!eventWithSections) {
      return null;
    }

    return eventWithSections;
  },

  async createEventWithSections(actorUserId, input) {
    return db.transaction(async (tx) => {
      const [createdEvent] = await tx
        .insert(events)
        .values({
          slug: input.slug,
          name: input.name,
          description: input.description,
          venueName: input.venueName,
          venueCity: input.venueCity,
          venueAddress: input.venueAddress,
          startsAt: input.startsAt,
          endsAt: toNullableDate(input.endsAt),
          saleStartsAt: input.saleStartsAt,
          saleEndsAt: toNullableDate(input.saleEndsAt),
          status: input.status ?? "draft",
          coverImageUrl: input.coverImageUrl,
          livestreamEnabled: input.livestreamEnabled ?? false,
          createdBy: actorUserId,
          updatedBy: actorUserId,
        })
        .returning();

      if (!createdEvent) {
        throw new Error("EVENT_INSERT_FAILED");
      }

      const createdSections =
        input.sections.length > 0
          ? await tx
              .insert(eventSections)
              .values(
                input.sections.map((section) => ({
                  eventId: createdEvent.id,
                  code: section.code,
                  name: section.name,
                  description: section.description,
                  price: section.price.toFixed(2),
                  capacity: section.capacity,
                })),
              )
              .returning()
          : [];

      await synchronizeEventStatusTx(tx, createdEvent.id);

      const refreshedEvent = await tx.query.events.findFirst({
        where: eq(events.id, createdEvent.id),
      });

      if (!refreshedEvent) {
        throw new Error("EVENT_NOT_FOUND");
      }

      return {
        ...refreshedEvent,
        sections: createdSections,
      };
    });
  },

  async updateEvent(eventId, actorUserId, input) {
    return db.transaction(async (tx) => {
      const updatePayload = Object.fromEntries(
        Object.entries({
          slug: input.slug,
          name: input.name,
          description: input.description,
          venueName: input.venueName,
          venueCity: input.venueCity,
          venueAddress: input.venueAddress,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          saleStartsAt: input.saleStartsAt,
          saleEndsAt: input.saleEndsAt,
          status: input.status,
          coverImageUrl: input.coverImageUrl,
          livestreamEnabled: input.livestreamEnabled,
        }).filter(([, value]) => value !== undefined),
      );

      const [updated] = await tx
        .update(events)
        .set({
          ...updatePayload,
          updatedBy: actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId))
        .returning();

      if (!updated) {
        return null;
      }

      await synchronizeEventStatusTx(tx, eventId);

      const refreshed = await tx.query.events.findFirst({
        where: eq(events.id, eventId),
      });

      return refreshed ?? updated;
    });
  },

  async overrideSectionCapacity(eventId, sectionId, actorUserId, input) {
    return db.transaction(async (tx) => {
      const section = await tx.query.eventSections.findFirst({
        where: and(
          eq(eventSections.id, sectionId),
          eq(eventSections.eventId, eventId),
        ),
      });

      if (!section) {
        return null;
      }

      const delta = input.action === "add" ? input.quantity : -input.quantity;
      const nextCapacity = section.capacity + delta;

      if (nextCapacity < 0) {
        throw new Error("NEGATIVE_CAPACITY");
      }

      const [updatedSection] = await tx
        .update(eventSections)
        .set({
          capacity: nextCapacity,
          updatedAt: new Date(),
        })
        .where(eq(eventSections.id, section.id))
        .returning();

      if (!updatedSection) {
        throw new Error("SECTION_UPDATE_FAILED");
      }

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          eventSectionId: section.id,
          actorUserId,
          movementType: input.action === "add" ? "admin_add" : "admin_withdraw",
          quantity: delta,
          stockBefore: section.capacity,
          stockAfter: nextCapacity,
          reason: input.reason,
        })
        .returning();

      if (!movement) {
        throw new Error("MOVEMENT_INSERT_FAILED");
      }

      await synchronizeEventStatusTx(tx, eventId);

      return {
        section: updatedSection,
        movement,
      };
    });
  },

  async getLiveDashboard(query) {
    const waitingFilter = query.eventId
      ? and(
          eq(waitingRoomJobs.eventId, query.eventId),
          inArray(waitingRoomJobs.status, ["queued", "processing"]),
        )
      : inArray(waitingRoomJobs.status, ["queued", "processing"]);

    const soldFilter = query.eventId
      ? and(
          eq(stockMovements.movementType, "sale"),
          eq(eventSections.eventId, query.eventId),
        )
      : eq(stockMovements.movementType, "sale");

    const activeViewerFilter = query.eventId
      ? and(
          eq(streamSessions.eventId, query.eventId),
          inArray(streamSessions.status, ["started", "playing", "paused"]),
        )
      : inArray(streamSessions.status, ["started", "playing", "paused"]);

    const resolutionFilter = query.eventId
      ? eq(streamSessions.eventId, query.eventId)
      : undefined;

    const [waitingRow] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(waitingRoomJobs)
      .where(waitingFilter);

    const [soldRow] = await db
      .select({
        sold: sql<number>`coalesce(cast(sum(abs(${stockMovements.quantity})) as int), 0)`,
      })
      .from(stockMovements)
      .innerJoin(
        eventSections,
        eq(stockMovements.eventSectionId, eventSections.id),
      )
      .where(soldFilter);

    const [capacityRow] = query.eventId
      ? await db
          .select({
            total: sql<number>`coalesce(cast(sum(${eventSections.capacity}) as int), 0)`,
          })
          .from(eventSections)
          .where(eq(eventSections.eventId, query.eventId))
      : await db
          .select({
            total: sql<number>`coalesce(cast(sum(${eventSections.capacity}) as int), 0)`,
          })
          .from(eventSections);

    const [viewerRow] = await db
      .select({
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(streamSessions)
      .where(activeViewerFilter);

    const topRows = await db
      .select({
        resolution: streamSessions.currentResolution,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(streamSessions)
      .where(resolutionFilter)
      .groupBy(streamSessions.currentResolution)
      .orderBy(desc(sql`count(*)`))
      .limit(query.topResolutionLimit ?? 3);

    return {
      waitingUsers: waitingRow?.count ?? 0,
      soldTickets: soldRow?.sold ?? 0,
      activeViewers: viewerRow?.count ?? 0,
      totalCapacity: capacityRow?.total ?? 0,
      topResolutions: topRows as TopResolutionMetric[],
    } satisfies LiveDashboardMetrics;
  },
};
