import type {
  CreateTicketOrderBody,
  ListTicketOrdersQuery,
} from "../dtos/ticket-orders";
import type { JwtService } from "../interfaces/auth.interface";
import {
  TicketOrdersServiceError,
  type TicketOrdersServiceContract,
} from "../interfaces/ticket-orders.interface";
import { resolveRequestAuth } from "../middlewares/auth.middleware";
import { errorResponse, successResponse } from "../utils/http-response";

interface RouteSet {
  status?: number;
  headers: Record<string, string | string[] | undefined>;
}

export interface TicketOrdersControllerContext {
  set: RouteSet;
  request: Request;
  jwt: JwtService;
}

export class TicketOrdersController {
  constructor(private readonly service: TicketOrdersServiceContract) {}

  async createTicketOrder(
    body: CreateTicketOrderBody,
    context: TicketOrdersControllerContext,
  ) {
    try {
      const authPayload = await resolveRequestAuth(
        context.request,
        context.jwt,
      );
      if (!authPayload) {
        return errorResponse(context.set, 401, "Unauthorized", [
          {
            code: "UNAUTHORIZED",
            message: "Access token is missing, invalid, or expired",
          },
        ]);
      }

      const result = await this.service.createTicketOrder(
        authPayload.sub,
        body,
      );
      return successResponse(
        context.set,
        201,
        "Order created successfully",
        result,
      );
    } catch (error) {
      return this.handleError(context.set, error);
    }
  }

  async getTicketOrderById(
    orderId: string,
    context: TicketOrdersControllerContext,
  ) {
    try {
      const authPayload = await resolveRequestAuth(
        context.request,
        context.jwt,
      );
      if (!authPayload) {
        return errorResponse(context.set, 401, "Unauthorized", [
          {
            code: "UNAUTHORIZED",
            message: "Access token is missing, invalid, or expired",
          },
        ]);
      }

      const result = await this.service.getTicketOrderById(
        orderId,
        authPayload.sub,
        authPayload.role,
      );
      return successResponse(
        context.set,
        200,
        "Order retrieved successfully",
        result,
      );
    } catch (error) {
      return this.handleError(context.set, error);
    }
  }

  async listTicketOrders(
    query: ListTicketOrdersQuery,
    context: TicketOrdersControllerContext,
  ) {
    try {
      const authPayload = await resolveRequestAuth(
        context.request,
        context.jwt,
      );
      if (!authPayload) {
        return errorResponse(context.set, 401, "Unauthorized", [
          {
            code: "UNAUTHORIZED",
            message: "Access token is missing, invalid, or expired",
          },
        ]);
      }

      const result = await this.service.listTicketOrders(
        query.page,
        query.size,
        authPayload.sub,
        authPayload.role,
      );

      return successResponse(
        context.set,
        200,
        "Orders retrieved successfully",
        result.items,
        {
          page: result.page,
          size: result.size,
          total_page: result.totalPage,
          total_item: result.totalItem,
        },
      );
    } catch (error) {
      return this.handleError(context.set, error);
    }
  }

  async scanTicketUnitByCode(
    ticketCode: string,
    context: TicketOrdersControllerContext,
  ) {
    try {
      const authPayload = await resolveRequestAuth(
        context.request,
        context.jwt,
      );
      if (!authPayload) {
        return errorResponse(context.set, 401, "Unauthorized", [
          {
            code: "UNAUTHORIZED",
            message: "Access token is missing, invalid, or expired",
          },
        ]);
      }

      const result = await this.service.scanTicketUnitByCode(
        ticketCode,
        authPayload.role,
      );

      return successResponse(
        context.set,
        200,
        "Ticket scanned successfully",
        result,
      );
    } catch (error) {
      return this.handleError(context.set, error);
    }
  }

  private handleError(set: RouteSet, error: unknown) {
    if (error instanceof TicketOrdersServiceError) {
      const status =
        error.code === "ORDER_NOT_FOUND" ||
        error.code === "EVENT_NOT_FOUND" ||
        error.code === "EVENT_SECTION_NOT_FOUND"
          ? 404
          : error.code === "EVENT_NOT_ON_SALE"
            ? 409
            : error.code === "INSUFFICIENT_STOCK"
              ? 409
              : error.code === "ORDER_IDEMPOTENCY_EXISTS"
                ? 409
                : error.code === "TICKET_ALREADY_USED"
                  ? 409
                  : error.code === "TICKET_NOT_FOUND"
                    ? 404
                    : error.code === "FORBIDDEN"
                      ? 403
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
