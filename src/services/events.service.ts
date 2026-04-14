import { DatabaseError } from "pg";

import type {
  CreateEventBody,
  LiveDashboardQuery,
  StockOverrideBody,
  UpdateEventBody,
} from "../dtos/admin";
import {
  EventsServiceError,
  type EventsRepositoryContract,
  type EventsServiceContract,
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

function mapDatabaseError(error: unknown): never {
  if (error instanceof DatabaseError && error.code === "23505") {
    throw new EventsServiceError(
      "EVENT_SLUG_EXISTS",
      "Event slug already exists",
    );
  }

  if (error instanceof DatabaseError && error.code === "23503") {
    throw new EventsServiceError(
      "DATABASE_ERROR",
      "Related record was not found for this operation",
    );
  }

  throw new EventsServiceError("DATABASE_ERROR", "A database error occurred");
}

export class EventsService implements EventsServiceContract {
  constructor(private readonly repository: EventsRepositoryContract) {}

  async createEvent(actorUserId: string, input: CreateEventBody) {
    validateEventTimeRange(input);

    try {
      // Check slug uniqueness and create event with sections in a transaction
      const existingEvent = await this.repository.getEventBySlug(input.slug);
      if (existingEvent) {
        throw new EventsServiceError(
          "EVENT_SLUG_EXISTS",
          "Event slug already exists",
        );
      }

      return await this.repository.createEventWithSections(actorUserId, input);
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
      const updated = await this.repository.updateEvent(
        eventId,
        actorUserId,
        input,
      );
      if (!updated) {
        throw new EventsServiceError("EVENT_NOT_FOUND", "Event was not found");
      }

      return updated;
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
      const result = await this.repository.overrideSectionCapacity(
        eventId,
        sectionId,
        actorUserId,
        input,
      );

      if (!result) {
        throw new EventsServiceError(
          "SECTION_NOT_FOUND",
          "Event section was not found",
        );
      }

      return result;
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
}

export const eventsService = new EventsService(eventsRepository);
