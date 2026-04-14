import type {
  CreateEventBody,
  LiveDashboardQuery,
  StockOverrideBody,
  UpdateEventBody,
} from "../dtos/admin";
import {
  EventsServiceError,
  type EventsServiceContract,
} from "../interfaces/events.interface";
import type { JwtService } from "../interfaces/auth.interface";
import { resolveRequestAuth } from "../middlewares/auth.middleware";
import { errorResponse, successResponse } from "../utils/http-response";

interface RouteSet {
  status?: number;
  headers: Record<string, string | string[] | undefined>;
}

export interface EventsControllerContext {
  set: RouteSet;
  request: Request;
  jwt: JwtService;
}

function forbidden(set: RouteSet) {
  return errorResponse(set, 403, "Forbidden", [
    {
      code: "FORBIDDEN",
      message: "Only admin users can access this endpoint",
    },
  ]);
}

export class EventsController {
  constructor(private readonly eventsService: EventsServiceContract) {}

  private async authorizeAdmin(context: EventsControllerContext) {
    const authPayload = await resolveRequestAuth(context.request, context.jwt);
    if (!authPayload) {
      return null;
    }

    if (authPayload.role !== "admin") {
      return undefined;
    }

    return authPayload;
  }

  async createEvent(body: CreateEventBody, context: EventsControllerContext) {
    try {
      const authPayload = await this.authorizeAdmin(context);
      if (authPayload === undefined) {
        return forbidden(context.set);
      }

      if (!authPayload) {
        return errorResponse(context.set, 401, "Unauthorized", [
          {
            code: "UNAUTHORIZED",
            message: "Access token is missing, invalid, or expired",
          },
        ]);
      }

      const result = await this.eventsService.createEvent(
        authPayload.sub,
        body,
      );
      return successResponse(
        context.set,
        201,
        "Event created successfully",
        result,
      );
    } catch (error) {
      return this.handleError(context.set, error);
    }
  }

  async updateEvent(
    eventId: string,
    body: UpdateEventBody,
    context: EventsControllerContext,
  ) {
    try {
      const authPayload = await this.authorizeAdmin(context);
      if (authPayload === undefined) {
        return forbidden(context.set);
      }

      if (!authPayload) {
        return errorResponse(context.set, 401, "Unauthorized", [
          {
            code: "UNAUTHORIZED",
            message: "Access token is missing, invalid, or expired",
          },
        ]);
      }

      const result = await this.eventsService.updateEvent(
        eventId,
        authPayload.sub,
        body,
      );
      return successResponse(
        context.set,
        200,
        "Event updated successfully",
        result,
      );
    } catch (error) {
      return this.handleError(context.set, error);
    }
  }

  async instantStockOverride(
    eventId: string,
    sectionId: string,
    body: StockOverrideBody,
    context: EventsControllerContext,
  ) {
    try {
      const authPayload = await this.authorizeAdmin(context);
      if (authPayload === undefined) {
        return forbidden(context.set);
      }

      if (!authPayload) {
        return errorResponse(context.set, 401, "Unauthorized", [
          {
            code: "UNAUTHORIZED",
            message: "Access token is missing, invalid, or expired",
          },
        ]);
      }

      const result = await this.eventsService.instantStockOverride(
        eventId,
        sectionId,
        authPayload.sub,
        body,
      );

      return successResponse(
        context.set,
        200,
        "Stock override processed successfully",
        result,
      );
    } catch (error) {
      return this.handleError(context.set, error);
    }
  }

  async liveDashboard(
    query: LiveDashboardQuery,
    context: EventsControllerContext,
  ) {
    try {
      const authPayload = await this.authorizeAdmin(context);
      if (authPayload === undefined) {
        return forbidden(context.set);
      }

      if (!authPayload) {
        return errorResponse(context.set, 401, "Unauthorized", [
          {
            code: "UNAUTHORIZED",
            message: "Access token is missing, invalid, or expired",
          },
        ]);
      }

      const result = await this.eventsService.getLiveDashboard(query);
      return successResponse(
        context.set,
        200,
        "Live dashboard metrics retrieved successfully",
        result,
      );
    } catch (error) {
      return this.handleError(context.set, error);
    }
  }

  private handleError(set: RouteSet, error: unknown) {
    if (error instanceof EventsServiceError) {
      const status =
        error.code === "EVENT_NOT_FOUND" || error.code === "SECTION_NOT_FOUND"
          ? 404
          : error.code === "INVALID_TIME_RANGE" ||
              error.code === "INVALID_STOCK_OVERRIDE"
            ? 422
            : error.code === "EVENT_SLUG_EXISTS"
              ? 409
              : 500;

      return errorResponse(set, status, error.message, [
        {
          code: error.code,
          message: error.message,
        },
      ]);
    }

    return errorResponse(set, 500, "Internal server error", [
      {
        code: "UNEXPECTED_ERROR",
        message: "An unexpected error occurred",
        details: error instanceof Error ? error.message : String(error),
      },
    ]);
  }
}
