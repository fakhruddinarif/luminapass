import {
  listOrdersPendingTicketEmail,
  markTicketEmailFailed,
  markTicketEmailSent,
} from "../repositories/ticket-units.repository";
import { sendTicketEmail } from "../utils/ticket-email";
import { logError, logInfo } from "../utils/logger";

const WORKER_INTERVAL_MS = 15_000;
const BATCH_SIZE = 20;

let timerRef: ReturnType<typeof setInterval> | null = null;

const ticketEmailWorkerMetrics = {
  ticks: 0,
  emailsSent: 0,
  emailsFailed: 0,
  emailsQueuedForRetry: 0,
  lastBatchCount: 0,
  lastTickAt: null as string | null,
};

function isRetryableEmailError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.startsWith("EMAIL_RETRYABLE:");
}

async function runTicketEmailTick(): Promise<void> {
  ticketEmailWorkerMetrics.ticks += 1;
  ticketEmailWorkerMetrics.lastTickAt = new Date().toISOString();

  try {
    const pendingOrders = await listOrdersPendingTicketEmail(BATCH_SIZE);
    ticketEmailWorkerMetrics.lastBatchCount = pendingOrders.length;

    for (const order of pendingOrders) {
      try {
        await sendTicketEmail({
          to: order.userEmail,
          fullName: order.userFullName,
          eventName: order.eventName,
          orderCode: order.orderCode,
          tickets: order.ticketUnits,
        });

        await markTicketEmailSent(
          order.id,
          order.ticketUnits.map((ticket) => ticket.id),
        );

        ticketEmailWorkerMetrics.emailsSent += 1;
      } catch (error) {
        ticketEmailWorkerMetrics.emailsFailed += 1;

        const retryable = isRetryableEmailError(error);
        if (retryable) {
          ticketEmailWorkerMetrics.emailsQueuedForRetry += 1;
        }

        await markTicketEmailFailed(
          order.id,
          error instanceof Error ? error.message : String(error),
          retryable,
        );

        logError("Ticket email delivery failed", {
          orderId: order.id,
          retryable,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (pendingOrders.length > 0) {
      logInfo("Ticket email worker processed batch", {
        count: pendingOrders.length,
      });
    }
  } catch (error) {
    ticketEmailWorkerMetrics.emailsFailed += 1;
    logError("Ticket email worker tick failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function startTicketEmailWorker(): void {
  if (timerRef) {
    return;
  }

  timerRef = setInterval(() => {
    void runTicketEmailTick();
  }, WORKER_INTERVAL_MS);

  logInfo("Ticket email worker started", {
    intervalMs: WORKER_INTERVAL_MS,
    batchSize: BATCH_SIZE,
  });
}

export function stopTicketEmailWorker(): void {
  if (!timerRef) {
    return;
  }

  clearInterval(timerRef);
  timerRef = null;
  logInfo("Ticket email worker stopped");
}

export function getTicketEmailWorkerRuntimeMetrics() {
  return {
    intervalMs: WORKER_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    ticks: ticketEmailWorkerMetrics.ticks,
    emailsSent: ticketEmailWorkerMetrics.emailsSent,
    emailsFailed: ticketEmailWorkerMetrics.emailsFailed,
    emailsQueuedForRetry: ticketEmailWorkerMetrics.emailsQueuedForRetry,
    lastBatchCount: ticketEmailWorkerMetrics.lastBatchCount,
    lastTickAt: ticketEmailWorkerMetrics.lastTickAt,
  };
}
