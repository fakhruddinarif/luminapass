import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "../config/db";
import { env } from "../config/env";
import { ticketOrders, ticketUnits } from "../entities";

interface PendingTicketEmailOrder {
  id: string;
  orderCode: string;
  userEmail: string;
  userFullName: string;
  eventName: string;
  ticketUnits: Array<{
    id: string;
    ticketCode: string;
    barcodeValue: string;
    barcodeFormat: string;
    barcodePayload: string;
  }>;
}

function buildTicketCode(
  orderCode: string,
  orderItemId: string,
  serial: number,
): string {
  return `${orderCode}-${orderItemId.slice(0, 6).toUpperCase()}-${String(serial).padStart(4, "0")}`;
}

function buildBarcodeValue(ticketCode: string): string {
  return `LPASS:${ticketCode}`;
}

export async function issueTicketUnitsForPaidOrderTx(
  tx: any,
  orderId: string,
): Promise<number> {
  const order = await tx.query.ticketOrders.findFirst({
    where: eq(ticketOrders.id, orderId),
    with: {
      event: true,
      user: true,
      items: true,
    },
  });

  if (!order || order.status !== "paid") {
    return 0;
  }

  const now = new Date();
  let createdCount = 0;

  for (const item of order.items) {
    const [existingCountRow] = await tx
      .select({
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(ticketUnits)
      .where(eq(ticketUnits.orderItemId, item.id));

    const existingCount = existingCountRow?.count ?? 0;
    const missingCount = Math.max(0, item.quantity - existingCount);

    if (missingCount === 0) {
      continue;
    }

    const values = Array.from({ length: missingCount }, (_, index) => {
      const serial = existingCount + index + 1;
      const ticketCode = buildTicketCode(order.orderCode, item.id, serial);
      const barcodeValue = buildBarcodeValue(ticketCode);

      return {
        orderId: order.id,
        orderItemId: item.id,
        eventId: order.eventId,
        eventSectionId: item.eventSectionId,
        userId: order.userId,
        ticketCode,
        barcodeValue,
        barcodeFormat: "code128",
        barcodePayload: barcodeValue,
        isUsed: false,
        createdAt: now,
        updatedAt: now,
      };
    });

    const inserted = await tx
      .insert(ticketUnits)
      .values(values)
      .returning({ id: ticketUnits.id });
    createdCount += inserted.length;
  }

  return createdCount;
}

export async function listOrdersPendingTicketEmail(
  limit = 20,
): Promise<PendingTicketEmailOrder[]> {
  const maxRetryAttempts = env.EMAIL_RETRY_MAX_ATTEMPTS;

  const candidates = await db.query.ticketOrders.findMany({
    where: and(
      eq(ticketOrders.status, "paid"),
      eq(ticketOrders.suppressTicketEmail, false),
      isNull(ticketOrders.ticketEmailSentAt),
      lt(ticketOrders.ticketEmailRetryCount, maxRetryAttempts),
      or(
        isNull(ticketOrders.ticketEmailNextRetryAt),
        lte(ticketOrders.ticketEmailNextRetryAt, new Date()),
      ),
    ),
    with: {
      user: true,
      event: true,
      ticketUnits: {
        where: isNull(ticketUnits.emailedAt),
        orderBy: desc(ticketUnits.createdAt),
      },
    },
    orderBy: desc(ticketOrders.updatedAt),
    limit,
  });

  return candidates
    .filter(
      (order) =>
        order.user?.email && order.event?.name && order.ticketUnits.length > 0,
    )
    .map((order) => ({
      id: order.id,
      orderCode: order.orderCode,
      userEmail: order.user!.email,
      userFullName: order.user!.fullName,
      eventName: order.event!.name,
      ticketUnits: order.ticketUnits.map((unit) => ({
        id: unit.id,
        ticketCode: unit.ticketCode,
        barcodeValue: unit.barcodeValue,
        barcodeFormat: unit.barcodeFormat,
        barcodePayload: unit.barcodePayload,
      })),
    }));
}

export async function markTicketEmailSent(
  orderId: string,
  ticketUnitIds: string[],
): Promise<void> {
  if (ticketUnitIds.length === 0) {
    return;
  }

  const now = new Date();

  await db
    .update(ticketUnits)
    .set({
      emailedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(ticketUnits.orderId, orderId),
        inArray(ticketUnits.id, ticketUnitIds),
      ),
    );

  await db
    .update(ticketOrders)
    .set({
      ticketEmailSentAt: now,
      ticketEmailRetryCount: 0,
      ticketEmailNextRetryAt: null,
      ticketEmailLastError: null,
      updatedAt: now,
    })
    .where(eq(ticketOrders.id, orderId));
}

export async function markTicketEmailFailed(
  orderId: string,
  reason: string,
  retryable: boolean,
): Promise<void> {
  const [order] = await db
    .select({
      retryCount: ticketOrders.ticketEmailRetryCount,
    })
    .from(ticketOrders)
    .where(eq(ticketOrders.id, orderId));

  if (!order) {
    return;
  }

  const maxRetryAttempts = env.EMAIL_RETRY_MAX_ATTEMPTS;
  const nextRetryCount = Math.min(order.retryCount + 1, maxRetryAttempts);

  let nextRetryAt: Date | null = null;

  if (retryable && nextRetryCount < maxRetryAttempts) {
    const backoffSeconds = Math.min(
      env.EMAIL_RETRY_BASE_SECONDS * 2 ** Math.max(0, nextRetryCount - 1),
      60 * 60,
    );

    nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);
  }

  await db
    .update(ticketOrders)
    .set({
      ticketEmailRetryCount: retryable ? nextRetryCount : maxRetryAttempts,
      ticketEmailNextRetryAt: nextRetryAt,
      ticketEmailLastError: reason,
      updatedAt: new Date(),
    })
    .where(eq(ticketOrders.id, orderId));
}

export async function scanTicketUnitByCode(ticketCode: string) {
  return db.transaction(async (tx) => {
    const ticketUnit = await tx.query.ticketUnits.findFirst({
      where: eq(ticketUnits.ticketCode, ticketCode),
    });

    if (!ticketUnit) {
      throw new Error("TICKET_NOT_FOUND");
    }

    if (ticketUnit.isUsed) {
      throw new Error("TICKET_ALREADY_USED");
    }

    const now = new Date();

    const [updated] = await tx
      .update(ticketUnits)
      .set({
        isUsed: true,
        usedAt: now,
        updatedAt: now,
      })
      .where(eq(ticketUnits.id, ticketUnit.id))
      .returning();

    if (!updated || !updated.usedAt) {
      throw new Error("TICKET_SCAN_FAILED");
    }

    return {
      id: updated.id,
      ticketCode: updated.ticketCode,
      orderId: updated.orderId,
      eventId: updated.eventId,
      eventSectionId: updated.eventSectionId,
      usedAt: updated.usedAt,
    };
  });
}
