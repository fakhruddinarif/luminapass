import { Elysia } from "elysia";

import { EventsController } from "../controllers/events.controller";
import {
  createEventBodySchema,
  liveDashboardQuerySchema,
  listEventsQuerySchema,
  stockOverrideBodySchema,
  updateEventBodySchema,
} from "../dtos/admin";
import type { JwtService } from "../interfaces/auth.interface";
import { eventsService } from "../services/events.service";
import { errorResponse } from "../utils/http-response";

interface RouteSet {
  status?: number;
  headers: Record<string, string | string[] | undefined>;
}

interface RouteContextBase {
  body: unknown;
  request: Request;
  set: RouteSet;
  params: Record<string, string | undefined>;
  query?: Record<string, unknown>;
}

interface RouteContext extends RouteContextBase {
  jwt: JwtService;
}

function parseJwt(context: unknown): JwtService {
  return (context as RouteContext).jwt;
}

const eventsController = new EventsController(eventsService);

export const eventsRoutes = new Elysia({ prefix: "/api" })

  .get("/events", async (context) => {
    const { set, request, query } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = listEventsQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid events query parameters",
        parsed.error.issues,
      );
    }

    return eventsController.listEvents(parsed.data, {
      set,
      request,
      jwt,
    });
  })
  .get("/events/id/:eventId", async (context) => {
    const { set, request, params } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const eventId = params.eventId;
    if (!eventId) {
      return errorResponse(set, 400, "eventId is required", [
        {
          code: "MISSING_PARAM",
          message: "Route parameter eventId was not provided",
          field: "eventId",
        },
      ]);
    }

    return eventsController.getEventById(eventId, { set, request, jwt });
  })
  .get("/events/slug/:slug", async (context) => {
    const { set, request, params } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const slug = params.slug;
    if (!slug) {
      return errorResponse(set, 400, "slug is required", [
        {
          code: "MISSING_PARAM",
          message: "Route parameter slug was not provided",
          field: "slug",
        },
      ]);
    }

    return eventsController.getEventBySlug(slug, { set, request, jwt });
  })

  .post("/events", async (context) => {
    const { body, set, request } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = createEventBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid event payload",
        parsed.error.issues,
      );
    }

    return eventsController.createEvent(parsed.data, { set, request, jwt });
  })
  .put("/events/:eventId", async (context) => {
    const { body, set, request, params } =
      context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const eventId = params.eventId;
    if (!eventId) {
      return errorResponse(set, 400, "eventId is required", [
        {
          code: "MISSING_PARAM",
          message: "Route parameter eventId was not provided",
          field: "eventId",
        },
      ]);
    }

    const parsed = updateEventBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid event update payload",
        parsed.error.issues,
      );
    }

    return eventsController.updateEvent(eventId, parsed.data, {
      set,
      request,
      jwt,
    });
  })
  .post("/events/stock/override", async (context) => {
    const { body, set, request, query } =
      context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const eventId =
      typeof query?.eventId === "string" ? query.eventId : undefined;
    const sectionId =
      typeof query?.sectionId === "string" ? query.sectionId : undefined;

    if (!eventId || !sectionId) {
      return errorResponse(set, 400, "eventId and sectionId are required", [
        {
          code: "MISSING_PARAM",
          message: "Required query parameters were not provided",
        },
      ]);
    }

    const parsed = stockOverrideBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid stock override payload",
        parsed.error.issues,
      );
    }

    return eventsController.instantStockOverride(
      eventId,
      sectionId,
      parsed.data,
      {
        set,
        request,
        jwt,
      },
    );
  })
  .get("/dashboard/live", async (context) => {
    const { set, request, query } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = liveDashboardQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid dashboard query parameters",
        parsed.error.issues,
      );
    }

    return eventsController.liveDashboard(parsed.data, {
      set,
      request,
      jwt,
    });
  });
