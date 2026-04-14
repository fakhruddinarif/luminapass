import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../config/db";
import type {
  CreateEventBody,
  LiveDashboardQuery,
  StockOverrideBody,
  UpdateEventBody,
} from "../dtos/admin";
import {
  eventSections,
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

function toNullableDate(date?: Date): Date | null {
  return date ?? null;
}

export const eventsRepository: EventsRepositoryContract = {
  async getEventBySlug(slug) {
    const event = await db.query.events.findFirst({
      where: eq(events.slug, slug),
    });

    return event ?? null;
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

      return {
        event: createdEvent,
        sections: createdSections,
      };
    });
  },

  async updateEvent(eventId, actorUserId, input) {
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(events)
        .set({
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.venueName !== undefined
            ? { venueName: input.venueName }
            : {}),
          ...(input.venueCity !== undefined
            ? { venueCity: input.venueCity }
            : {}),
          ...(input.venueAddress !== undefined
            ? { venueAddress: input.venueAddress }
            : {}),
          ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
          ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
          ...(input.saleStartsAt !== undefined
            ? { saleStartsAt: input.saleStartsAt }
            : {}),
          ...(input.saleEndsAt !== undefined
            ? { saleEndsAt: input.saleEndsAt }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.coverImageUrl !== undefined
            ? { coverImageUrl: input.coverImageUrl }
            : {}),
          ...(input.livestreamEnabled !== undefined
            ? { livestreamEnabled: input.livestreamEnabled }
            : {}),
          updatedBy: actorUserId,
          updatedAt: new Date(),
        })
        .where(eq(events.id, eventId))
        .returning();

      return updated ?? null;
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
