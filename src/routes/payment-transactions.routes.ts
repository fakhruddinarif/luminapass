import { Elysia } from "elysia";

import { PaymentTransactionsController } from "../controllers/payment-transactions.controller";
import {
  createPaymentTransactionBodySchema,
  getPaymentTransactionParamsSchema,
  listPaymentTransactionsQuerySchema,
  paymentWebhookBodySchema,
} from "../dtos/payment-transactions";
import type { JwtService } from "../interfaces/auth.interface";
import { paymentTransactionsService } from "../services/payment-transactions.service";
import { errorResponse } from "../utils/http-response";

interface RouteSet {
  status?: number;
  headers: Record<string, string | string[] | undefined>;
}

interface RouteContextBase {
  body: unknown;
  request: Request;
  set: RouteSet;
  query?: Record<string, unknown>;
  params: Record<string, string | undefined>;
}

interface RouteContext extends RouteContextBase {
  jwt: JwtService;
}

function parseJwt(context: unknown): JwtService {
  return (context as RouteContext).jwt;
}

const paymentTransactionsController = new PaymentTransactionsController(
  paymentTransactionsService,
);

export const paymentTransactionsRoutes = new Elysia({ prefix: "/api" })
  .get("/payment-transactions", async (context) => {
    const { request, set, query } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = listPaymentTransactionsQuerySchema.safeParse(query ?? {});
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid payment transactions query parameters",
        parsed.error.issues,
      );
    }

    return paymentTransactionsController.listPaymentTransactions(parsed.data, {
      request,
      set,
      jwt,
    });
  })
  .get("/payment-transactions/:paymentId", async (context) => {
    const { request, set, params } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = getPaymentTransactionParamsSchema.safeParse(params);
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid payment transaction id parameter",
        parsed.error.issues,
      );
    }

    return paymentTransactionsController.getPaymentTransactionById(
      parsed.data.paymentId,
      {
        request,
        set,
        jwt,
      },
    );
  })
  .post("/payment-transactions", async (context) => {
    const { body, request, set } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = createPaymentTransactionBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid payment transaction payload",
        parsed.error.issues,
      );
    }

    return paymentTransactionsController.createPaymentTransaction(parsed.data, {
      request,
      set,
      jwt,
    });
  })
  .post("/payment-transactions/webhook", async (context) => {
    const { body, request, set } = context as unknown as RouteContextBase;
    const jwt = parseJwt(context);

    const parsed = paymentWebhookBodySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        set,
        400,
        "Invalid payment webhook payload",
        parsed.error.issues,
      );
    }

    return paymentTransactionsController.processPaymentWebhook(parsed.data, {
      request,
      set,
      jwt,
    });
  });
