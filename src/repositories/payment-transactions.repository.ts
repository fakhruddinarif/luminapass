import { and, eq, inArray, or, sql } from "drizzle-orm";

import { db } from "../config/db";
import type { PaymentWebhookBody } from "../dtos/payment-transactions";
import {
  paymentTransactions,
  ticketOrderItems,
  ticketOrders,
} from "../entities";

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type DbExecutor = typeof db | DbTx;

function useExecutor(executor?: DbExecutor): DbExecutor {
  return executor ?? db;
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

export async function findOrderByIdTx(orderId: string, executor?: DbExecutor) {
  const orm = useExecutor(executor);
  return orm.query.ticketOrders.findFirst({
    where: eq(ticketOrders.id, orderId),
  });
}

export async function insertPaymentTransactionTx(
  payload: typeof paymentTransactions.$inferInsert,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [createdTxn] = await orm
    .insert(paymentTransactions)
    .values(payload)
    .returning();

  return createdTxn ?? null;
}

export async function updateOrderAfterPaymentCreateTx(
  orderId: string,
  payload: Partial<typeof ticketOrders.$inferInsert>,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [updatedOrder] = await orm
    .update(ticketOrders)
    .set(payload)
    .where(
      and(
        eq(ticketOrders.id, orderId),
        or(
          eq(ticketOrders.status, "awaiting_payment"),
          eq(ticketOrders.status, "reserved"),
          eq(ticketOrders.status, "processing"),
        ),
      ),
    )
    .returning();

  return updatedOrder ?? null;
}

export async function findTransactionByWebhookInputTx(
  input: PaymentWebhookBody,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  return orm.query.paymentTransactions.findFirst({
    where: and(
      eq(paymentTransactions.provider, input.provider),
      buildWebhookLookupCondition(input),
    ),
  });
}

export async function findDuplicateWebhookEventTx(
  provider: string,
  webhookEventId: string,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  return orm.query.paymentTransactions.findFirst({
    where: and(
      eq(paymentTransactions.provider, provider),
      eq(paymentTransactions.webhookEventId, webhookEventId),
    ),
  });
}

export async function updatePaymentTransactionTx(
  transactionId: string,
  payload: Partial<typeof paymentTransactions.$inferInsert>,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [updatedTxn] = await orm
    .update(paymentTransactions)
    .set(payload)
    .where(eq(paymentTransactions.id, transactionId))
    .returning();

  return updatedTxn ?? null;
}

export async function updateOrderAfterWebhookTx(
  orderId: string,
  payload: Partial<typeof ticketOrders.$inferInsert>,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const [updatedOrder] = await orm
    .update(ticketOrders)
    .set(payload)
    .where(eq(ticketOrders.id, orderId))
    .returning();

  return updatedOrder ?? null;
}

export async function getOrderItemsWithSectionTx(
  orderId: string,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  return orm.query.ticketOrderItems.findMany({
    where: eq(ticketOrderItems.orderId, orderId),
    with: {
      eventSection: true,
    },
  });
}

export async function getPaymentAggregateByTransactionIdTx(
  transactionId: string,
  executor?: DbExecutor,
) {
  const orm = useExecutor(executor);
  const transactionAggregate = await orm.query.paymentTransactions.findFirst({
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

  return transactionAggregate;
}

export const paymentTransactionsRepository = {
  findOrderByIdTx,
  insertPaymentTransactionTx,
  updateOrderAfterPaymentCreateTx,
  findTransactionByWebhookInputTx,
  findDuplicateWebhookEventTx,
  updatePaymentTransactionTx,
  updateOrderAfterWebhookTx,
  getOrderItemsWithSectionTx,
  getPaymentAggregateByTransactionIdTx,

  async getPaymentTransactionById(paymentId: string) {
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

  async listPaymentTransactions(
    page: number,
    size: number,
    actorUserId?: string,
  ) {
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
