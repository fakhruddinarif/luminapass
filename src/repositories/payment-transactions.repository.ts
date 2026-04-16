import { and, eq, inArray, or, sql } from "drizzle-orm";
import { DatabaseError } from "pg";

import { db } from "../config/db";
import type { PaymentWebhookBody } from "../dtos/payment-transactions";
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
import { synchronizeEventStatusTx } from "./events.repository";
import { enqueueOutboxEventTx } from "./outbox.repository";
import { issueTicketUnitsForPaidOrderTx } from "./ticket-units.repository";

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

function buildWebhookLookupCondition(input: PaymentWebhookBody) {
  if (input.providerOrderId) {
    const providerOrderMatch = eq(
      paymentTransactions.providerOrderId,
      input.providerOrderId,
    );

    if (input.externalTxnId) {
      return or(
        providerOrderMatch,
        eq(paymentTransactions.externalTxnId, input.externalTxnId),
      );
    }

    return providerOrderMatch;
  }

  return eq(paymentTransactions.externalTxnId, input.externalTxnId!);
}

async function findTransactionByWebhookInput(
  tx: any,
  input: PaymentWebhookBody,
) {
  return tx.query.paymentTransactions.findFirst({
    where: and(
      eq(paymentTransactions.provider, input.provider),
      buildWebhookLookupCondition(input),
    ),
  });
}

async function findWebhookEventDuplicate(
  tx: any,
  input: PaymentWebhookBody,
  currentTransactionId: string,
) {
  if (!input.webhookEventId) {
    return null;
  }

  const eventExists = await tx.query.paymentTransactions.findFirst({
    where: and(
      eq(paymentTransactions.provider, input.provider),
      eq(paymentTransactions.webhookEventId, input.webhookEventId),
    ),
  });

  if (!eventExists || eventExists.id === currentTransactionId) {
    return null;
  }

  return eventExists;
}

async function updateTransactionFromWebhook(
  tx: any,
  transactionId: string,
  input: PaymentWebhookBody,
  now: Date,
) {
  try {
    const updatePayload: Partial<typeof paymentTransactions.$inferInsert> = {
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
    };

    if (input.status === "captured") {
      updatePayload.settledAt = now;
    }

    if (input.status === "failed") {
      updatePayload.failureReason = input.statusMessage;
    }

    const [updatedTxn] = await tx
      .update(paymentTransactions)
      .set(updatePayload)
      .where(eq(paymentTransactions.id, transactionId))
      .returning();

    return {
      updatedTxn,
      duplicateByWebhook: null as
        | null
        | typeof paymentTransactions.$inferSelect,
    };
  } catch (error) {
    const isDedupRace =
      error instanceof DatabaseError &&
      error.code === "23505" &&
      input.webhookEventId;

    if (!isDedupRace) {
      throw error;
    }

    const duplicateByWebhook = await tx.query.paymentTransactions.findFirst({
      where: and(
        eq(paymentTransactions.provider, input.provider),
        eq(paymentTransactions.webhookEventId, input.webhookEventId!),
      ),
    });

    if (!duplicateByWebhook) {
      throw error;
    }

    return {
      updatedTxn: undefined,
      duplicateByWebhook,
    };
  }
}

async function releaseReservedStock(
  tx: any,
  orderId: string,
  reason: string,
): Promise<void> {
  const items = await tx.query.ticketOrderItems.findMany({
    where: eq(ticketOrderItems.orderId, orderId),
    with: {
      eventSection: true,
    },
  });

  for (const item of items) {
    if (!item.eventSection) {
      continue;
    }

    const [updatedSection] = await tx
      .update(eventSections)
      .set({
        capacity: sql`${eventSections.capacity} + ${item.quantity}`,
        updatedAt: new Date(),
      })
      .where(eq(eventSections.id, item.eventSection.id))
      .returning();

    if (!updatedSection) {
      continue;
    }

    await tx.insert(stockMovements).values({
      eventSectionId: item.eventSection.id,
      orderId,
      movementType: "release",
      quantity: item.quantity,
      stockBefore: updatedSection.capacity - item.quantity,
      stockAfter: updatedSection.capacity,
      reason,
    });
  }
}

async function getPaymentAggregateByTransactionId(
  tx: any,
  transactionId: string,
): Promise<PaymentTransactionAggregate> {
  const transactionAggregate = await tx.query.paymentTransactions.findFirst({
    where: eq(paymentTransactions.id, transactionId),
    with: {
      order: {
        with: {
          items: true,
          event: {
            with: {
              sections: true,
            },
          },
        },
      },
    },
  });

  if (!transactionAggregate) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  return transactionAggregate satisfies PaymentTransactionAggregate;
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
        const suppressTicketEmail =
          order.suppressTicketEmail ||
          isLoadTestCreatePaymentInput(input.simulatorCode);
        const now = new Date();

        const transactionInsertPayload: typeof paymentTransactions.$inferInsert =
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
          };

        if (simulated.status === "captured") {
          transactionInsertPayload.settledAt = now;
        }

        const [createdTxn] = await tx
          .insert(paymentTransactions)
          .values(transactionInsertPayload)
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
            suppressTicketEmail,
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

          await synchronizeEventStatusTx(tx, order.eventId);
        }

        if (nextOrderStatus === "paid" && !updatedOrder.suppressTicketEmail) {
          await issueTicketUnitsForPaidOrderTx(tx, updatedOrder.id);
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

        return getPaymentAggregateByTransactionId(tx, createdTxn.id);
      });
    },

    async processPaymentWebhook(input) {
      return db.transaction(async (tx) => {
        const transaction = await findTransactionByWebhookInput(tx, input);

        if (!transaction) {
          return null;
        }

        const duplicateByEvent = await findWebhookEventDuplicate(
          tx,
          input,
          transaction.id,
        );
        if (duplicateByEvent) {
          return getPaymentAggregateByTransactionId(tx, duplicateByEvent.id);
        }

        const now = new Date();
        const targetOrderStatus = mapPaymentStatusToOrderStatus(input.status);
        const suppressTicketEmail = isLoadTestWebhookInput(input);

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
          return getPaymentAggregateByTransactionId(tx, transaction.id);
        }

        const { updatedTxn, duplicateByWebhook } =
          await updateTransactionFromWebhook(tx, transaction.id, input, now);

        if (duplicateByWebhook) {
          return getPaymentAggregateByTransactionId(tx, duplicateByWebhook.id);
        }

        if (!updatedTxn) {
          throw new Error("TRANSACTION_UPDATE_FAILED");
        }

        const [updatedOrder] = await tx
          .update(ticketOrders)
          .set({
            status: targetOrderStatus,
            paidAt: targetOrderStatus === "paid" ? now : null,
            suppressTicketEmail:
              existingOrder.suppressTicketEmail || suppressTicketEmail,
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

          await synchronizeEventStatusTx(tx, existingOrder.eventId);
        }

        if (targetOrderStatus === "paid" && !updatedOrder.suppressTicketEmail) {
          await issueTicketUnitsForPaidOrderTx(tx, updatedOrder.id);
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

        return getPaymentAggregateByTransactionId(tx, updatedTxn.id);
      });
    },

    async getPaymentTransactionById(paymentId) {
      const payment = await db.query.paymentTransactions.findFirst({
        where: eq(paymentTransactions.id, paymentId),
        with: {
          order: {
            with: {
              items: true,
              event: {
                with: {
                  sections: true,
                },
              },
            },
          },
        },
      });

      return payment ?? null;
    },

    async listPaymentTransactions(page, size, actorUserId) {
      const pageQuery = Math.max(1, page);
      const sizeQuery = Math.max(1, Math.min(100, size));
      const offset = (pageQuery - 1) * sizeQuery;

      const whereClause = actorUserId
        ? inArray(
            paymentTransactions.orderId,
            db
              .select({ id: ticketOrders.id })
              .from(ticketOrders)
              .where(eq(ticketOrders.userId, actorUserId)),
          )
        : undefined;

      const payments = await db.query.paymentTransactions.findMany({
        where: whereClause,
        with: {
          order: {
            with: {
              items: true,
              event: {
                with: {
                  sections: true,
                },
              },
            },
          },
        },
        orderBy: (table, { desc }) => desc(table.createdAt),
        limit: sizeQuery,
        offset,
      });

      const [countRow] = whereClause
        ? await db
            .select({
              count: sql<number>`cast(count(*) as int)`,
            })
            .from(paymentTransactions)
            .where(whereClause)
        : await db
            .select({
              count: sql<number>`cast(count(*) as int)`,
            })
            .from(paymentTransactions);

      const totalItem = countRow?.count ?? 0;
      const totalPage = Math.max(1, Math.ceil(totalItem / sizeQuery));

      return {
        items: payments,
        page: pageQuery,
        size: sizeQuery,
        totalItem,
        totalPage,
      };
    },
  };
