import type {
  CreateEventBody,
  LiveDashboardQuery,
  StockOverrideBody,
  UpdateEventBody,
} from "../dtos/admin";

export interface TopResolutionMetric {
  resolution: "1080p" | "720p" | "480p";
  count: number;
}

export interface LiveDashboardMetrics {
  waitingUsers: number;
  soldTickets: number;
  activeViewers: number;
  totalCapacity: number;
  topResolutions: TopResolutionMetric[];
}

export interface EventsRepositoryContract {
  createEventWithSections(
    actorUserId: string,
    input: CreateEventBody,
  ): Promise<unknown>;
  updateEvent(
    eventId: string,
    actorUserId: string,
    input: UpdateEventBody,
  ): Promise<unknown | null>;
  overrideSectionCapacity(
    eventId: string,
    sectionId: string,
    actorUserId: string,
    input: StockOverrideBody,
  ): Promise<unknown>;
  getLiveDashboard(query: LiveDashboardQuery): Promise<LiveDashboardMetrics>;
}

export interface EventsServiceContract {
  createEvent(actorUserId: string, input: CreateEventBody): Promise<unknown>;
  updateEvent(
    eventId: string,
    actorUserId: string,
    input: UpdateEventBody,
  ): Promise<unknown>;
  instantStockOverride(
    eventId: string,
    sectionId: string,
    actorUserId: string,
    input: StockOverrideBody,
  ): Promise<unknown>;
  getLiveDashboard(query: LiveDashboardQuery): Promise<LiveDashboardMetrics>;
}

export class EventsServiceError extends Error {
  constructor(
    public readonly code:
      | "EVENT_NOT_FOUND"
      | "SECTION_NOT_FOUND"
      | "EVENT_SLUG_EXISTS"
      | "INVALID_TIME_RANGE"
      | "INVALID_STOCK_OVERRIDE"
      | "DATABASE_ERROR",
    message: string,
  ) {
    super(message);
  }
}
