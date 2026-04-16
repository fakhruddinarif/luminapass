import { DatabaseError } from "pg";

import type {
  CreatePaymentTransactionBody,
  PaymentWebhookBody,
} from "../dtos/payment-transactions";
import { db } from "../config/db";
import {
  type PaginatedPaymentTransactionsResult,
  PaymentTransactionsServiceError,
  type PaymentTransactionAggregate,
  type PaymentTransactionsServiceContract,
} from "../interfaces/payment-transactions.interface";
import { synchronizeEventStatusTx } from "../repositories/events.repository";
import { enqueueOutboxEventTx } from "../repositories/outbox.repository";
import { paymentTransactionsRepository } from "../repositories/payment-transactions.repository";
import {
  insertStockMovementTx,
  releaseSectionCapacityTx,
} from "../repositories/ticket-orders.repository";
import { issueTicketUnitsForPaidOrderTx } from "../repositories/ticket-units.repository";

interface PaymentTransactionsServiceDependencies {
  synchronizeEventStatusTx: typeof synchronizeEventStatusTx;
  enqueueOutboxEventTx: typeof enqueueOutboxEventTx;
  releaseSectionCapacityTx: typeof releaseSectionCapacityTx;
  insertStockMovementTx: typeof insertStockMovementTx;
  issueTicketUnitsForPaidOrderTx: typeof issueTicketUnitsForPaidOrderTx;
}

const paymentTransactionsServiceDependencies: PaymentTransactionsServiceDependencies =
  {
    synchronizeEventStatusTx,
    enqueueOutboxEventTx,
    releaseSectionCapacityTx,
    insertStockMovementTx,
    issueTicketUnitsForPaidOrderTx,
  };

function isLoadTestWebhookInput(input: PaymentWebhookBody): boolean {
  const payload = input.payload;
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const source = (payload as Record<string, unknown>).source;
  return typeof source === "string" && source.toLowerCase() === "k6";
}

function isLoadTestCreatePaymentInput(simulatorCode?: string): boolean {
  return (
    typeof simulatorCode === "string" &&
    simulatorCode.toLowerCase().includes("k6")
  );
}

function resolveMockPaymentResult(simulatorCode?: string): {
  status: "captured" | "failed";
  failureReason: string | null;
} {
  if (simulatorCode?.endsWith("404")) {
    return {
      status: "failed",
      failureReason: "Simulated provider failure for test scenario",
    };
  }

  return {
    status: "captured",
    failureReason: null,
  };
}

function mapPaymentStatusToOrderStatus(
  status: PaymentWebhookBody["status"] | "captured" | "failed",
): "awaiting_payment" | "paid" | "failed" | "expired" | "cancelled" {
  if (status === "captured") {
    return "paid";
  }

  if (status === "failed") {
    return "failed";
  }

  if (status === "expired") {
    return "expired";
  }

  if (status === "cancelled" || status === "refunded") {
    return "cancelled";
  }

  return "awaiting_payment";
}

function isFinalOrderStatus(status: string): boolean {
  return (
    status === "paid" ||
    status === "failed" ||
    status === "expired" ||
    status === "cancelled"
  );
}

async function releaseReservedStock(
  orderId: string,
  reason: string,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  repository: typeof paymentTransactionsRepository,
  deps: PaymentTransactionsServiceDependencies,
): Promise<void> {
  const items = await repository.getOrderItemsWithSectionTx(orderId, tx);

  for (const item of items) {
    if (!item.eventSection) {
      continue;
    }

    const updatedSection = await deps.releaseSectionCapacityTx(
      item.eventSection.id,
      item.quantity,
      tx,
    );

    if (!updatedSection) {
      continue;
    }

    await deps.insertStockMovementTx(
      {
        eventSectionId: item.eventSection.id,
        orderId,
        movementType: "release",
        quantity: item.quantity,
        stockBefore: updatedSection.capacity - item.quantity,
        stockAfter: updatedSection.capacity,
        reason,
      },
      tx,
    );
  }
}

function mapPaymentDatabaseError(error: unknown): never {
  if (error instanceof DatabaseError && error.code === "23505") {
    throw new PaymentTransactionsServiceError(
      "PAYMENT_IDEMPOTENCY_EXISTS",
      "Payment idempotency key already exists",
    );
  }

  if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
    throw new PaymentTransactionsServiceError(
      "ORDER_NOT_FOUND",
      "Order was not found",
    );
  }

  if (error instanceof Error && error.message === "ORDER_ALREADY_FINALIZED") {
    throw new PaymentTransactionsServiceError(
      "ORDER_ALREADY_FINALIZED",
      "Order is already in a final state",
    );
  }

  throw new PaymentTransactionsServiceError(
    "DATABASE_ERROR",
    "A database error occurred while processing payment",
  );
}

export class PaymentTransactionsService implements PaymentTransactionsServiceContract {
  constructor(
    private readonly repository: typeof paymentTransactionsRepository,
    private readonly deps: PaymentTransactionsServiceDependencies = paymentTransactionsServiceDependencies,
  ) {}

  async createPaymentTransaction(
    input: CreatePaymentTransactionBody,
  ): Promise<PaymentTransactionAggregate> {
    try {
      return await db.transaction(async (tx) => {
        const order = await this.repository.findOrderByIdTx(input.orderId, tx);

        if (!order) {
          throw new Error("ORDER_NOT_FOUND");
        }

        if (isFinalOrderStatus(order.status)) {
          throw new Error("ORDER_ALREADY_FINALIZED");
        }

        const simulated = resolveMockPaymentResult(input.simulatorCode);
        const nextOrderStatus = mapPaymentStatusToOrderStatus(simulated.status);
        const suppressTicketEmail =
          order.suppressTicketEmail ||
          isLoadTestCreatePaymentInput(input.simulatorCode);
        const now = new Date();

        const createdTxn = await this.repository.insertPaymentTransactionTx(
          {
            orderId: order.id,
            provider: input.provider,
            providerOrderId: order.orderCode,
            externalTxnId: `MOCK-${order.orderCode}`,
            idempotencyKey: input.idempotencyKey,
            amount: order.totalAmount,
            status: simulated.status,
            rawProviderStatus: simulated.status,
            paymentType: "mock_transfer",
            statusMessage:
              simulated.status === "captured"
                ? "Payment captured successfully"
                : "Payment failed",
            simulatorCode: input.simulatorCode,
            failureReason: simulated.failureReason,
            providerRequestPayload: {
              orderCode: order.orderCode,
              amount: order.totalAmount,
              provider: input.provider,
            },
            providerResponsePayload: {
              status: simulated.status,
              transactionId: `MOCK-${order.orderCode}`,
            },
            processedAt: now,
            settledAt: simulated.status === "captured" ? now : null,
          },
          tx,
        );

        if (!createdTxn) {
          throw new Error("PAYMENT_INSERT_FAILED");
        }

        const updatedOrder =
          await this.repository.updateOrderAfterPaymentCreateTx(
            order.id,
            {
              status: nextOrderStatus,
              paymentReference: createdTxn.externalTxnId,
              paidAt: nextOrderStatus === "paid" ? now : null,
              failedReason: simulated.failureReason,
              suppressTicketEmail,
              updatedAt: now,
            },
            tx,
          );

        if (!updatedOrder) {
          throw new Error("ORDER_UPDATE_FAILED");
        }

        if (nextOrderStatus !== "paid") {
          await releaseReservedStock(
            order.id,
            `Payment ${nextOrderStatus}, reserved stock released`,
            tx,
            this.repository,
            this.deps,
          );

          await this.deps.synchronizeEventStatusTx(order.eventId, now, tx);
        }

        if (nextOrderStatus === "paid" && !updatedOrder.suppressTicketEmail) {
          await this.deps.issueTicketUnitsForPaidOrderTx(tx, updatedOrder.id);
        }

        await this.deps.enqueueOutboxEventTx(tx, {
          aggregateType: "payment_transaction",
          aggregateId: createdTxn.id,
          eventType: "payment.transaction.created",
          routingKey: "payment.transaction.created",
          payload: {
            orderId: updatedOrder.id,
            paymentId: createdTxn.id,
            status: createdTxn.status,
            provider: createdTxn.provider,
          },
        });

        return this.repository.getPaymentAggregateByTransactionIdTx(
          createdTxn.id,
          tx,
        );
      });
    } catch (error) {
      mapPaymentDatabaseError(error);
    }
  }

  async listPaymentTransactions(
    page: number,
    size: number,
    actorUserId: string,
    actorRole: "customer" | "admin",
  ): Promise<PaginatedPaymentTransactionsResult> {
    try {
      return await this.repository.listPaymentTransactions(
        page,
        size,
        actorRole === "admin" ? undefined : actorUserId,
      );
    } catch (error) {
      console.error("Error listing payment transactions:", error);
      mapPaymentDatabaseError(error);
    }
  }

  async getPaymentTransactionById(
    paymentId: string,
    actorUserId: string,
    actorRole: "customer" | "admin",
  ): Promise<PaymentTransactionAggregate> {
    try {
      const payment =
        await this.repository.getPaymentTransactionById(paymentId);

      if (!payment) {
        throw new PaymentTransactionsServiceError(
          "PAYMENT_NOT_FOUND",
          "Payment transaction was not found",
        );
      }

      if (
        actorRole !== "admin" &&
        (!payment.order || payment.order.userId !== actorUserId)
      ) {
        throw new PaymentTransactionsServiceError(
          "FORBIDDEN",
          "You are not allowed to access this payment",
        );
      }

      return payment;
    } catch (error) {
      if (error instanceof PaymentTransactionsServiceError) {
        throw error;
      }

      mapPaymentDatabaseError(error);
    }
  }

  async processPaymentWebhook(
    input: PaymentWebhookBody,
  ): Promise<PaymentTransactionAggregate> {
    try {
      const result = await db.transaction(async (tx) => {
        const transaction =
          await this.repository.findTransactionByWebhookInputTx(input, tx);

        if (!transaction) {
          return null;
        }

        if (input.webhookEventId) {
          const duplicateByEvent =
            await this.repository.findDuplicateWebhookEventTx(
              input.provider,
              input.webhookEventId,
              tx,
            );

          if (duplicateByEvent && duplicateByEvent.id !== transaction.id) {
            return this.repository.getPaymentAggregateByTransactionIdTx(
              duplicateByEvent.id,
              tx,
            );
          }
        }

        const now = new Date();
        const targetOrderStatus = mapPaymentStatusToOrderStatus(input.status);
        const suppressTicketEmail = isLoadTestWebhookInput(input);

        const existingOrder = await this.repository.findOrderByIdTx(
          transaction.orderId,
          tx,
        );

        if (!existingOrder) {
          throw new Error("ORDER_NOT_FOUND");
        }

        if (
          isFinalOrderStatus(existingOrder.status) &&
          existingOrder.status !== targetOrderStatus
        ) {
          return this.repository.getPaymentAggregateByTransactionIdTx(
            transaction.id,
            tx,
          );
        }

        let updatedTxn;

        try {
          updatedTxn = await this.repository.updatePaymentTransactionTx(
            transaction.id,
            {
              status: input.status,
              rawProviderStatus: input.rawProviderStatus ?? input.status,
              statusMessage: input.statusMessage,
              paymentType: input.paymentType,
              channelCode: input.channelCode,
              fraudStatus: input.fraudStatus,
              webhookEventId: input.webhookEventId,
              webhookSignatureValid: input.signatureValid,
              webhookReceivedAt: now,
              webhookPayload: input.payload ?? null,
              updatedAt: now,
              settledAt:
                input.status === "captured" ? now : transaction.settledAt,
              failureReason:
                input.status === "failed"
                  ? (input.statusMessage ?? null)
                  : transaction.failureReason,
            },
            tx,
          );
        } catch (error) {
          const isDedupRace =
            error instanceof DatabaseError &&
            error.code === "23505" &&
            Boolean(input.webhookEventId);

          if (!isDedupRace) {
            throw error;
          }

          const duplicateByWebhook =
            await this.repository.findDuplicateWebhookEventTx(
              input.provider,
              input.webhookEventId!,
              tx,
            );

          if (!duplicateByWebhook) {
            throw error;
          }

          return this.repository.getPaymentAggregateByTransactionIdTx(
            duplicateByWebhook.id,
            tx,
          );
        }

        if (!updatedTxn) {
          throw new Error("TRANSACTION_UPDATE_FAILED");
        }

        const updatedOrder = await this.repository.updateOrderAfterWebhookTx(
          transaction.orderId,
          {
            status: targetOrderStatus,
            paidAt: targetOrderStatus === "paid" ? now : null,
            suppressTicketEmail:
              existingOrder.suppressTicketEmail || suppressTicketEmail,
            failedReason:
              targetOrderStatus === "paid"
                ? null
                : (input.statusMessage ?? null),
            updatedAt: now,
          },
          tx,
        );

        if (!updatedOrder) {
          throw new Error("ORDER_UPDATE_FAILED");
        }

        const wasReserved =
          existingOrder.status === "awaiting_payment" ||
          existingOrder.status === "reserved" ||
          existingOrder.status === "processing";

        if (targetOrderStatus !== "paid" && wasReserved) {
          await releaseReservedStock(
            existingOrder.id,
            `Webhook moved order to ${targetOrderStatus}, reserved stock released`,
            tx,
            this.repository,
            this.deps,
          );

          await this.deps.synchronizeEventStatusTx(
            existingOrder.eventId,
            now,
            tx,
          );
        }

        if (targetOrderStatus === "paid" && !updatedOrder.suppressTicketEmail) {
          await this.deps.issueTicketUnitsForPaidOrderTx(tx, updatedOrder.id);
        }

        await this.deps.enqueueOutboxEventTx(tx, {
          aggregateType: "payment_transaction",
          aggregateId: updatedTxn.id,
          eventType: "payment.webhook.processed",
          routingKey: "payment.webhook.processed",
          payload: {
            orderId: updatedOrder.id,
            paymentId: updatedTxn.id,
            status: updatedTxn.status,
            provider: updatedTxn.provider,
            webhookEventId: updatedTxn.webhookEventId,
          },
        });

        return this.repository.getPaymentAggregateByTransactionIdTx(
          updatedTxn.id,
          tx,
        );
      });

      if (!result) {
        throw new PaymentTransactionsServiceError(
          "WEBHOOK_TRANSACTION_NOT_FOUND",
          "Matching transaction for webhook payload was not found",
        );
      }

      return result;
    } catch (error) {
      if (error instanceof PaymentTransactionsServiceError) {
        throw error;
      }

      mapPaymentDatabaseError(error);
    }
  }
}

export const paymentTransactionsService = new PaymentTransactionsService(
  paymentTransactionsRepository,
);
