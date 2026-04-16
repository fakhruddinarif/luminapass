import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";

import { db } from "../config/db";
import type { LiveDashboardQuery } from "../dtos/admin";
import {
  eventSections,
  eventStatusEnum,
  events,
  stockMovements,
  streamSessions,
  waitingRoomJobs,
} from "../entities";
import type {
  LiveDashboardMetrics,
  TopResolutionMetric,
} from "../interfaces/events.interface";
import { resolveEventLifecycleStatus } from "../utils/event-status";

function toNullableDate(date?: Date): Date | null {
  return date ?? null;
}

type EventStatus = (typeof eventStatusEnum.enumValues)[number];
type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | DbTx;

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

function useExecutor(executor?: DbExecutor): DbExecutor {
  return executor ?? db;
}

export async function getSectionStatsByEventId(
  eventId: string,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [row] = await orm
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

export async function getEventByIdTx(eventId: string, executor?: DbExecutor) {
  const orm = useExecutor(executor);
  return orm.query.events.findFirst({
    where: eq(events.id, eventId),
  });
}

export async function getEventBySlugTx(slug: string, executor?: DbExecutor) {
  const orm = useExecutor(executor);
  return orm.query.events.findFirst({
    where: eq(events.slug, slug),
    with: {
      sections: true,
    },
  });
}

export async function insertEventTx(
  payload: typeof events.$inferInsert,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [createdEvent] = await orm.insert(events).values(payload).returning();
  return createdEvent ?? null;
}

export async function insertEventSectionsTx(
  payload: Array<typeof eventSections.$inferInsert>,
  executor?: DbExecutor,
) {
  if (payload.length === 0) {
    return [] as Array<typeof eventSections.$inferSelect>;
  }

  const orm = useExecutor(executor);
  return orm.insert(eventSections).values(payload).returning();
}

export async function updateEventByIdTx(
  eventId: string,
  payload: Partial<typeof events.$inferInsert>,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [updated] = await orm
    .update(events)
    .set(payload)
    .where(eq(events.id, eventId))
    .returning();

  return updated ?? null;
}

export async function findEventSectionTx(
  eventId: string,
  sectionId: string,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  return orm.query.eventSections.findFirst({
    where: and(
      eq(eventSections.id, sectionId),
      eq(eventSections.eventId, eventId),
    ),
  });
}

export async function updateEventSectionCapacityTx(
  sectionId: string,
  nextCapacity: number,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [updatedSection] = await orm
    .update(eventSections)
    .set({
      capacity: nextCapacity,
      updatedAt: new Date(),
    })
    .where(eq(eventSections.id, sectionId))
    .returning();

  return updatedSection ?? null;
}

export async function insertStockMovementTx(
  payload: typeof stockMovements.$inferInsert,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [movement] = await orm
    .insert(stockMovements)
    .values(payload)
    .returning();
  return movement ?? null;
}

export async function listAutoManagedEventsTx(
  limit = 200,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  return orm.query.events.findMany({
    where: inArray(events.status, AUTO_MANAGED_EVENT_STATUSES),
    limit,
    orderBy: desc(events.updatedAt),
  });
}

export async function setEventStatusTx(
  eventId: string,
  status: EventStatus,
  now = new Date(),
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  await orm
    .update(events)
    .set({
      status,
      updatedAt: now,
    })
    .where(eq(events.id, eventId));
}

export async function synchronizeEventStatusTx(
  eventId: string,
  now = new Date(),
  executor?: DbExecutor,
): Promise<EventStatusSyncResult> {
  const event = await getEventByIdTx(eventId, executor);

  if (!event) {
    return "not_found";
  }

  const sectionStats = await getSectionStatsByEventId(eventId, executor);

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

  await setEventStatusTx(eventId, nextStatus, now, executor);

  return "updated";
}

export async function synchronizeEventStatus(
  eventId: string,
  now = new Date(),
): Promise<void> {
  await synchronizeEventStatusTx(eventId, now);
}

export async function synchronizeAutoEventStatuses(
  limit = 200,
): Promise<number> {
  const candidates = await listAutoManagedEventsTx(limit);
  const now = new Date();
  let updatedCount = 0;

  for (const event of candidates) {
    const result = await synchronizeEventStatusTx(event.id, now);
    if (result === "updated") {
      updatedCount += 1;
    }
  }

  return updatedCount;
}

export const eventsRepository = {
  getEventByIdTx,
  getEventBySlugTx,
  insertEventTx,
  insertEventSectionsTx,
  updateEventByIdTx,
  findEventSectionTx,
  updateEventSectionCapacityTx,
  insertStockMovementTx,
  listAutoManagedEventsTx,
  synchronizeEventStatusTx,

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

  async getEventById(eventId: string) {
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

  async getEventBySlug(slug: string) {
    return getEventBySlugTx(slug);
  },

  async getLiveDashboard(query: LiveDashboardQuery) {
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
