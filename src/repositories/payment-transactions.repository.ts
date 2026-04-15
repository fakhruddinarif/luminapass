import { and, eq, or, sql } from "drizzle-orm";
import { DatabaseError } from "pg";

import { db } from "../config/db";
import type {
  CreatePaymentTransactionBody,
  PaymentWebhookBody,
} from "../dtos/payment-transactions";
import {
  eventSections,
  paymentTransactions,
  stockMovements,
  ticketOrderItems,
  ticketOrders,
} from "../entities";
import type {
  PaymentTransactionAggregate,
  PaymentTransactionsRepositoryContract,
} from "../interfaces/payment-transactions.interface";
import { enqueueOutboxEventTx } from "./outbox.repository";

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
  tx: any,
  orderId: string,
  reason: string,
): Promise<void> {
  const items = await tx
    .select()
    .from(ticketOrderItems)
    .where(eq(ticketOrderItems.orderId, orderId));

  for (const item of items) {
    const [section] = await tx
      .select()
      .from(eventSections)
      .where(eq(eventSections.id, item.eventSectionId))
      .limit(1);

    if (!section) {
      continue;
    }

    const [updatedSection] = await tx
      .update(eventSections)
      .set({
        capacity: sql`${eventSections.capacity} + ${item.quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(eventSections.id, section.id))
      .returning();

    if (!updatedSection) {
      continue;
    }

    await tx.insert(stockMovements).values({
      eventSectionId: section.id,
      orderId,
      movementType: "release",
      quantity: item.quantity,
      stockBefore: updatedSection.capacity - item.quantity,
      stockAfter: updatedSection.capacity,
      reason,
    });
  }
}

export const paymentTransactionsRepository: PaymentTransactionsRepositoryContract =
  {
    async createPaymentTransaction(input) {
      return db.transaction(async (tx) => {
        const order = await tx.query.ticketOrders.findFirst({
          where: eq(ticketOrders.id, input.orderId),
        });

        if (!order) {
          throw new Error("ORDER_NOT_FOUND");
        }

        if (isFinalOrderStatus(order.status)) {
          throw new Error("ORDER_ALREADY_FINALIZED");
        }

        const simulated = resolveMockPaymentResult(input.simulatorCode);
        const nextOrderStatus = mapPaymentStatusToOrderStatus(simulated.status);
        const now = new Date();

        const [createdTxn] = await tx
          .insert(paymentTransactions)
          .values({
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
            ...(simulated.status === "captured" ? { settledAt: now } : {}),
          })
          .returning();

        if (!createdTxn) {
          throw new Error("PAYMENT_INSERT_FAILED");
        }

        const [updatedOrder] = await tx
          .update(ticketOrders)
          .set({
            status: nextOrderStatus,
            paymentReference: createdTxn.externalTxnId,
            paidAt: nextOrderStatus === "paid" ? now : null,
            failedReason: simulated.failureReason,
            updatedAt: now,
          })
          .where(
            and(
              eq(ticketOrders.id, order.id),
              or(
                eq(ticketOrders.status, "awaiting_payment"),
                eq(ticketOrders.status, "reserved"),
                eq(ticketOrders.status, "processing"),
              ),
            ),
          )
          .returning();

        if (!updatedOrder) {
          throw new Error("ORDER_UPDATE_FAILED");
        }

        if (nextOrderStatus !== "paid") {
          await releaseReservedStock(
            tx,
            order.id,
            `Payment ${nextOrderStatus}, reserved stock released`,
          );
        }

        await enqueueOutboxEventTx(tx, {
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

        return {
          transaction: createdTxn,
          order: updatedOrder,
        } satisfies PaymentTransactionAggregate;
      });
    },

    async processPaymentWebhook(input) {
      return db.transaction(async (tx) => {
        const lookupCondition = input.providerOrderId
          ? or(
              eq(paymentTransactions.providerOrderId, input.providerOrderId),
              input.externalTxnId
                ? eq(paymentTransactions.externalTxnId, input.externalTxnId)
                : eq(
                    paymentTransactions.providerOrderId,
                    input.providerOrderId,
                  ),
            )
          : eq(paymentTransactions.externalTxnId, input.externalTxnId!);

        const transaction = await tx.query.paymentTransactions.findFirst({
          where: and(
            eq(paymentTransactions.provider, input.provider),
            lookupCondition,
          ),
        });

        if (!transaction) {
          return null;
        }

        if (input.webhookEventId) {
          const eventExists = await tx.query.paymentTransactions.findFirst({
            where: and(
              eq(paymentTransactions.provider, input.provider),
              eq(paymentTransactions.webhookEventId, input.webhookEventId),
            ),
          });

          if (eventExists && eventExists.id !== transaction.id) {
            const existingOrder = await tx.query.ticketOrders.findFirst({
              where: eq(ticketOrders.id, eventExists.orderId),
            });

            if (!existingOrder) {
              throw new Error("ORDER_NOT_FOUND");
            }

            return {
              transaction: eventExists,
              order: existingOrder,
            } satisfies PaymentTransactionAggregate;
          }
        }

        const now = new Date();
        const targetOrderStatus = mapPaymentStatusToOrderStatus(input.status);

        const existingOrder = await tx.query.ticketOrders.findFirst({
          where: eq(ticketOrders.id, transaction.orderId),
        });

        if (!existingOrder) {
          throw new Error("ORDER_NOT_FOUND");
        }

        if (
          isFinalOrderStatus(existingOrder.status) &&
          existingOrder.status !== targetOrderStatus
        ) {
          return {
            transaction,
            order: existingOrder,
          } satisfies PaymentTransactionAggregate;
        }

        let updatedTxn: typeof paymentTransactions.$inferSelect | undefined;

        try {
          [updatedTxn] = await tx
            .update(paymentTransactions)
            .set({
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
              ...(input.status === "captured" ? { settledAt: now } : {}),
              ...(input.status === "failed"
                ? { failureReason: input.statusMessage }
                : {}),
              updatedAt: now,
            })
            .where(eq(paymentTransactions.id, transaction.id))
            .returning();
        } catch (error) {
          const isDedupRace =
            error instanceof DatabaseError &&
            error.code === "23505" &&
            input.webhookEventId;

          if (!isDedupRace) {
            throw error;
          }

          const existingByWebhook =
            await tx.query.paymentTransactions.findFirst({
              where: and(
                eq(paymentTransactions.provider, input.provider),
                eq(paymentTransactions.webhookEventId, input.webhookEventId!),
              ),
            });

          if (!existingByWebhook) {
            throw error;
          }

          const existingOrder = await tx.query.ticketOrders.findFirst({
            where: eq(ticketOrders.id, existingByWebhook.orderId),
          });

          if (!existingOrder) {
            throw new Error("ORDER_NOT_FOUND");
          }

          return {
            transaction: existingByWebhook,
            order: existingOrder,
          } satisfies PaymentTransactionAggregate;
        }

        if (!updatedTxn) {
          throw new Error("TRANSACTION_UPDATE_FAILED");
        }

        const [updatedOrder] = await tx
          .update(ticketOrders)
          .set({
            status: targetOrderStatus,
            paidAt: targetOrderStatus === "paid" ? now : null,
            failedReason:
              targetOrderStatus === "paid"
                ? null
                : (input.statusMessage ?? null),
            updatedAt: now,
          })
          .where(eq(ticketOrders.id, transaction.orderId))
          .returning();

        if (!updatedOrder) {
          throw new Error("ORDER_UPDATE_FAILED");
        }

        const wasReserved =
          existingOrder.status === "awaiting_payment" ||
          existingOrder.status === "reserved" ||
          existingOrder.status === "processing";

        if (targetOrderStatus !== "paid" && wasReserved) {
          await releaseReservedStock(
            tx,
            existingOrder.id,
            `Webhook moved order to ${targetOrderStatus}, reserved stock released`,
          );
        }

        await enqueueOutboxEventTx(tx, {
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

        return {
          transaction: updatedTxn,
          order: updatedOrder,
        } satisfies PaymentTransactionAggregate;
      });
    },
  };
