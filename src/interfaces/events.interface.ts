import type {
  CreateEventBody,
  LiveDashboardQuery,
  StockOverrideBody,
  UpdateEventBody,
} from "../dtos/admin";
import type { eventSections, events, stockMovements } from "../entities";

export type EventRow = typeof events.$inferSelect;
export type EventSectionRow = typeof eventSections.$inferSelect;
export type StockMovementRow = typeof stockMovements.$inferSelect;

export interface EventWithSections {
  event: EventRow;
  sections: EventSectionRow[];
}

export interface StockOverrideResult {
  section: EventSectionRow;
  movement: StockMovementRow;
}

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
  getEventBySlug(slug: string): Promise<EventRow | null>;
  createEventWithSections(
    actorUserId: string,
    input: CreateEventBody,
  ): Promise<EventWithSections>;
  updateEvent(
    eventId: string,
    actorUserId: string,
    input: UpdateEventBody,
  ): Promise<EventRow | null>;
  overrideSectionCapacity(
    eventId: string,
    sectionId: string,
    actorUserId: string,
    input: StockOverrideBody,
  ): Promise<StockOverrideResult | null>;
  getLiveDashboard(query: LiveDashboardQuery): Promise<LiveDashboardMetrics>;
}

export interface EventsServiceContract {
  createEvent(
    actorUserId: string,
    input: CreateEventBody,
  ): Promise<EventWithSections>;
  updateEvent(
    eventId: string,
    actorUserId: string,
    input: UpdateEventBody,
  ): Promise<EventRow>;
  instantStockOverride(
    eventId: string,
    sectionId: string,
    actorUserId: string,
    input: StockOverrideBody,
  ): Promise<StockOverrideResult>;
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
