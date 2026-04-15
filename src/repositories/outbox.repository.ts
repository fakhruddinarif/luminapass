import { and, asc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "../config/db";
import { outboxEvents } from "../entities";

export interface OutboxInsertPayload {
  aggregateType: string;
  aggregateId?: string;
  eventType: string;
  routingKey: string;
  payload: Record<string, unknown>;
}

export type OutboxEventRow = typeof outboxEvents.$inferSelect;

type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function enqueueOutboxEventTx(
  tx: DbTx,
  payload: OutboxInsertPayload,
): Promise<void> {
  await tx.insert(outboxEvents).values({
    aggregateType: payload.aggregateType,
    aggregateId: payload.aggregateId,
    eventType: payload.eventType,
    routingKey: payload.routingKey,
    payload: payload.payload,
    status: "pending",
  });
}

export async function claimOutboxEvents(
  limit = 200,
): Promise<OutboxEventRow[]> {
  return db.transaction(async (tx) => {
    const dueEvents = await tx
      .select()
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.status, "pending"),
          or(
            isNull(outboxEvents.nextAttemptAt),
            lte(outboxEvents.nextAttemptAt, new Date()),
          ),
        ),
      )
      .orderBy(asc(outboxEvents.createdAt))
      .limit(limit);

    const claimed: OutboxEventRow[] = [];

    for (const event of dueEvents) {
      const [claimedRow] = await tx
        .update(outboxEvents)
        .set({
          status: "processing",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(outboxEvents.id, event.id),
            eq(outboxEvents.status, "pending"),
          ),
        )
        .returning();

      if (claimedRow) {
        claimed.push(claimedRow);
      }
    }

    return claimed;
  });
}

export async function markOutboxPublished(eventId: string): Promise<void> {
  await db
    .update(outboxEvents)
    .set({
      status: "published",
      publishedAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
    })
    .where(eq(outboxEvents.id, eventId));
}

export async function markOutboxFailed(
  eventId: string,
  previousAttempts: number,
  errorMessage: string,
): Promise<void> {
  const nextAttempts = previousAttempts + 1;
  const delayMs = Math.min(nextAttempts * 1_000, 60_000);
  const nextAttemptAt = new Date(Date.now() + delayMs);

  await db
    .update(outboxEvents)
    .set({
      status: "pending",
      attempts: nextAttempts,
      lastError: errorMessage,
      nextAttemptAt,
      updatedAt: new Date(),
    })
    .where(eq(outboxEvents.id, eventId));
}

export interface OutboxQueueMetrics {
  available: boolean;
  queueDepth: number;
  retryCount: number;
  lagMs: number;
  errorMessage?: string;
}

export async function getOutboxQueueMetrics(): Promise<OutboxQueueMetrics> {
  try {
    const [depthRow] = await db
      .select({
        queueDepth: sql<number>`cast(count(*) as int)`,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.status, "pending"));

    const [retryRow] = await db
      .select({
        retryCount: sql<number>`coalesce(cast(sum(${outboxEvents.attempts}) as int), 0)`,
      })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.status, "pending"),
          isNotNull(outboxEvents.nextAttemptAt),
        ),
      );

    const [oldestPendingRow] = await db
      .select({
        createdAt: sql<Date | null>`min(${outboxEvents.createdAt})`,
      })
      .from(outboxEvents)
      .where(eq(outboxEvents.status, "pending"));

    const now = Date.now();
    const oldestCreatedAt = oldestPendingRow?.createdAt
      ? new Date(oldestPendingRow.createdAt).getTime()
      : null;

    return {
      available: true,
      queueDepth: depthRow?.queueDepth ?? 0,
      retryCount: retryRow?.retryCount ?? 0,
      lagMs: oldestCreatedAt ? Math.max(now - oldestCreatedAt, 0) : 0,
    };
  } catch (error) {
    return {
      available: false,
      queueDepth: 0,
      retryCount: 0,
      lagMs: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}
