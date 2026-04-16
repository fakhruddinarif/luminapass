import type {
  CreateEventBody,
  LiveDashboardQuery,
  StockOverrideBody,
  UpdateEventBody,
} from "../dtos/admin";
import { db } from "../config/db";
import {
  EventsServiceError,
  type EventWithSections,
  type EventsServiceContract,
  type PaginatedEventsResult,
} from "../interfaces/events.interface";
import { eventsRepository } from "../repositories/events.repository";

function validateEventTimeRange(input: {
  startsAt?: Date;
  endsAt?: Date;
  saleStartsAt?: Date;
  saleEndsAt?: Date;
}) {
  if (input.endsAt && input.startsAt && input.endsAt <= input.startsAt) {
    throw new EventsServiceError(
      "INVALID_TIME_RANGE",
      "endsAt must be greater than startsAt",
    );
  }

  if (
    input.saleEndsAt &&
    input.saleStartsAt &&
    input.saleEndsAt <= input.saleStartsAt
  ) {
    throw new EventsServiceError(
      "INVALID_TIME_RANGE",
      "saleEndsAt must be greater than saleStartsAt",
    );
  }
}

function extractDatabaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as {
    code?: unknown;
    cause?: unknown;
  };

  if (typeof candidate.code === "string") {
    return candidate.code;
  }

  return extractDatabaseErrorCode(candidate.cause);
}

function mapDatabaseError(error: unknown): never {
  const errorCode = extractDatabaseErrorCode(error);

  if (errorCode === "23505") {
    throw new EventsServiceError(
      "EVENT_SLUG_EXISTS",
      "Event slug already exists",
    );
  }

  if (errorCode === "23503") {
    throw new EventsServiceError(
      "DATABASE_ERROR",
      "Related record was not found for this operation",
    );
  }

  throw new EventsServiceError("DATABASE_ERROR", "A database error occurred");
}

export class EventsService implements EventsServiceContract {
  constructor(private readonly repository: typeof eventsRepository) {}

  async listEvents(
    page: number,
    size: number,
    search?: string,
    filterStatus?: string,
  ): Promise<PaginatedEventsResult> {
    try {
      return await this.repository.listEvents(page, size, search, filterStatus);
    } catch (err) {
      if (err instanceof EventsServiceError) {
        throw err;
      }

      throw new EventsServiceError(
        "DATABASE_ERROR",
        "A database error occurred while listing events",
      );
    }
  }

  async getEventById(id: string): Promise<EventWithSections> {
    try {
      const event = await this.repository.getEventById(id);
      if (!event) {
        throw new EventsServiceError("EVENT_NOT_FOUND", "Event was not found");
      }

      return event;
    } catch (error) {
      if (error instanceof EventsServiceError) {
        throw error;
      }

      if (extractDatabaseErrorCode(error) === "22P02") {
        throw new EventsServiceError("EVENT_NOT_FOUND", "Event was not found");
      }

      mapDatabaseError(error);
    }
  }

  async getEventBySlug(slug: string): Promise<EventWithSections> {
    try {
      const event = await this.repository.getEventBySlug(slug);
      if (!event) {
        throw new EventsServiceError("EVENT_NOT_FOUND", "Event was not found");
      }

      return event;
    } catch (error) {
      if (error instanceof EventsServiceError) {
        throw error;
      }

      mapDatabaseError(error);
    }
  }

  async createEvent(actorUserId: string, input: CreateEventBody) {
    validateEventTimeRange(input);

    try {
      const existingEvent = await this.repository.getEventBySlugTx(input.slug);
      if (existingEvent) {
        throw new EventsServiceError(
          "EVENT_SLUG_EXISTS",
          "Event slug already exists",
        );
      }

      return await db.transaction(async (tx) => {
        const createdEvent = await this.repository.insertEventTx(
          {
            slug: input.slug,
            name: input.name,
            description: input.description,
            venueName: input.venueName,
            venueCity: input.venueCity,
            venueAddress: input.venueAddress,
            startsAt: input.startsAt,
            endsAt: input.endsAt ?? null,
            saleStartsAt: input.saleStartsAt,
            saleEndsAt: input.saleEndsAt ?? null,
            status: input.status ?? "draft",
            coverImageUrl: input.coverImageUrl,
            livestreamEnabled: input.livestreamEnabled ?? false,
            createdBy: actorUserId,
            updatedBy: actorUserId,
          },
          tx,
        );

        if (!createdEvent) {
          throw new Error("EVENT_INSERT_FAILED");
        }

        const createdSections = await this.repository.insertEventSectionsTx(
          input.sections.map((section) => ({
            eventId: createdEvent.id,
            code: section.code,
            name: section.name,
            description: section.description,
            price: section.price.toFixed(2),
            capacity: section.capacity,
          })),
          tx,
        );

        await this.repository.synchronizeEventStatusTx(
          createdEvent.id,
          new Date(),
          tx,
        );

        const refreshedEvent = await this.repository.getEventByIdTx(
          createdEvent.id,
          tx,
        );
        if (!refreshedEvent) {
          throw new Error("EVENT_NOT_FOUND");
        }

        return {
          ...refreshedEvent,
          sections: createdSections,
        };
      });
    } catch (error) {
      if (error instanceof EventsServiceError) {
        throw error;
      }

      mapDatabaseError(error);
    }
  }

  async updateEvent(
    eventId: string,
    actorUserId: string,
    input: UpdateEventBody,
  ) {
    validateEventTimeRange(input);

    try {
      return await db.transaction(async (tx) => {
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

        const updated = await this.repository.updateEventByIdTx(
          eventId,
          {
            ...updatePayload,
            updatedBy: actorUserId,
            updatedAt: new Date(),
          },
          tx,
        );

        if (!updated) {
          throw new EventsServiceError(
            "EVENT_NOT_FOUND",
            "Event was not found",
          );
        }

        await this.repository.synchronizeEventStatusTx(eventId, new Date(), tx);
        const refreshed = await this.repository.getEventByIdTx(eventId, tx);

        return refreshed ?? updated;
      });
    } catch (error) {
      if (error instanceof EventsServiceError) {
        throw error;
      }

      mapDatabaseError(error);
    }
  }

  async instantStockOverride(
    eventId: string,
    sectionId: string,
    actorUserId: string,
    input: StockOverrideBody,
  ) {
    try {
      return await db.transaction(async (tx) => {
        const section = await this.repository.findEventSectionTx(
          eventId,
          sectionId,
          tx,
        );
        if (!section) {
          throw new EventsServiceError(
            "SECTION_NOT_FOUND",
            "Event section was not found",
          );
        }

        const delta = input.action === "add" ? input.quantity : -input.quantity;
        const nextCapacity = section.capacity + delta;

        if (nextCapacity < 0) {
          throw new Error("NEGATIVE_CAPACITY");
        }

        const updatedSection =
          await this.repository.updateEventSectionCapacityTx(
            section.id,
            nextCapacity,
            tx,
          );

        if (!updatedSection) {
          throw new Error("SECTION_UPDATE_FAILED");
        }

        const movement = await this.repository.insertStockMovementTx(
          {
            eventSectionId: section.id,
            actorUserId,
            movementType:
              input.action === "add" ? "admin_add" : "admin_withdraw",
            quantity: delta,
            stockBefore: section.capacity,
            stockAfter: nextCapacity,
            reason: input.reason,
          },
          tx,
        );

        if (!movement) {
          throw new Error("MOVEMENT_INSERT_FAILED");
        }

        await this.repository.synchronizeEventStatusTx(eventId, new Date(), tx);

        return {
          section: updatedSection,
          movement,
        };
      });
    } catch (error) {
      if (error instanceof EventsServiceError) {
        throw error;
      }

      if (error instanceof Error && error.message === "NEGATIVE_CAPACITY") {
        throw new EventsServiceError(
          "INVALID_STOCK_OVERRIDE",
          "Resulting capacity cannot be negative",
        );
      }

      throw new EventsServiceError(
        "DATABASE_ERROR",
        "A database error occurred while overriding stock",
      );
    }
  }

  async getLiveDashboard(query: LiveDashboardQuery) {
    try {
      return await this.repository.getLiveDashboard(query);
    } catch {
      throw new EventsServiceError(
        "DATABASE_ERROR",
        "A database error occurred while reading dashboard metrics",
      );
    }
  }

  async synchronizeAutoEventStatuses(limit = 200): Promise<number> {
    return db.transaction(async (tx) => {
      const candidates = await this.repository.listAutoManagedEventsTx(
        limit,
        tx,
      );
      const now = new Date();
      let updatedCount = 0;

      for (const event of candidates) {
        const result = await this.repository.synchronizeEventStatusTx(
          event.id,
          now,
          tx,
        );
        if (result === "updated") {
          updatedCount += 1;
        }
      }

      return updatedCount;
    });
  }
}

export const eventsService = new EventsService(eventsRepository);
