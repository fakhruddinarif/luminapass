import { Elysia } from "elysia";

import { TicketOrdersController } from "../controllers/ticket-orders.controller";
import {
  createTicketOrderBodySchema,
  getTicketOrderParamsSchema,
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
}

interface RouteContext extends RouteContextBase {
  jwt: JwtService;
}

function parseJwt(context: unknown): JwtService {
  return (context as RouteContext).jwt;
}

const ticketOrdersController = new TicketOrdersController(ticketOrdersService);

export const ticketOrdersRoutes = new Elysia({ prefix: "/api" })
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
  });
