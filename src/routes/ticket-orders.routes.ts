import { Elysia } from "elysia";

import { TicketOrdersController } from "../controllers/ticket-orders.controller";
import {
  createTicketOrderBodySchema,
  getTicketOrderParamsSchema,
  listTicketOrdersQuerySchema,
  scanTicketUnitParamsSchema,
} from "../dtos/ticket-orders";
import type { JwtService } from "../interfaces/auth.interface";
import { ticketOrdersService } from "../services/ticket-orders.service";
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

const ticketOrdersController = new TicketOrdersController(ticketOrdersService);

export const ticketOrdersRoutes = new Elysia({ prefix: "/api" })
  .get("/ticket-orders", async (context) => {
    const { request, set, query } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = listTicketOrdersQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid ticket order list query parameters",
        parsed.error.issues,
      );
    }

    return ticketOrdersController.listTicketOrders(parsed.data, {
      request,
      set,
      jwt,
    });
  })
  .post("/ticket-orders", async (context) => {
    const { body, request, set } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = createTicketOrderBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid ticket order payload",
        parsed.error.issues,
      );
    }

    return ticketOrdersController.createTicketOrder(parsed.data, {
      request,
      set,
      jwt,
    });
  })
  .get("/ticket-orders/:orderId", async (context) => {
    const { request, set, params } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = getTicketOrderParamsSchema.safeParse(params);
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid order id parameter",
        parsed.error.issues,
      );
    }

    return ticketOrdersController.getTicketOrderById(parsed.data.orderId, {
      request,
      set,
      jwt,
    });
  })
  .post("/ticket-units/:ticketCode/scan", async (context) => {
    const { request, set, params } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = scanTicketUnitParamsSchema.safeParse(params);
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid ticket code parameter",
        parsed.error.issues,
      );
    }

    return ticketOrdersController.scanTicketUnitByCode(parsed.data.ticketCode, {
      request,
      set,
      jwt,
    });
  });
