import type {
  CreatePaymentTransactionBody,
  PaymentWebhookBody,
} from "../dtos/payment-transactions";
import type { JwtService } from "../interfaces/auth.interface";
import {
  PaymentTransactionsServiceError,
  type PaymentTransactionsServiceContract,
} from "../interfaces/payment-transactions.interface";
import { resolveRequestAuth } from "../middlewares/auth.middleware";
import { errorResponse, successResponse } from "../utils/http-response";

interface RouteSet {
  status?: number;
  headers: Record<string, string | string[] | undefined>;
}

export interface PaymentTransactionsControllerContext {
  set: RouteSet;
  request: Request;
  jwt: JwtService;
}

export class PaymentTransactionsController {
  constructor(private readonly service: PaymentTransactionsServiceContract) {}

  async createPaymentTransaction(
    body: CreatePaymentTransactionBody,
    context: PaymentTransactionsControllerContext,
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

      const result = await this.service.createPaymentTransaction(body);
      return successResponse(
        context.set,
        201,
        "Payment transaction created successfully",
        result,
      );
    } catch (error) {
      return this.handleError(context.set, error);
    }
  }

  async processPaymentWebhook(
    body: PaymentWebhookBody,
    context: PaymentTransactionsControllerContext,
  ) {
    try {
      const result = await this.service.processPaymentWebhook(body);
      return successResponse(
        context.set,
        200,
        "Payment webhook processed successfully",
        result,
      );
    } catch (error) {
      return this.handleError(context.set, error);
    }
  }

  private handleError(set: RouteSet, error: unknown) {
    if (error instanceof PaymentTransactionsServiceError) {
      const status =
        error.code === "ORDER_NOT_FOUND" ||
        error.code === "WEBHOOK_TRANSACTION_NOT_FOUND"
          ? 404
          : error.code === "ORDER_ALREADY_FINALIZED"
            ? 409
            : error.code === "PAYMENT_IDEMPOTENCY_EXISTS"
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
