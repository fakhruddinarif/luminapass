import {
  claimOutboxEvents,
  markOutboxFailed,
  markOutboxPublished,
} from "../repositories/outbox.repository";
import { publishAppEvent } from "../config/rabbitmq-runtime";
import { logError, logInfo } from "../utils/logger";

const WORKER_INTERVAL_MS = 1_000;
const BATCH_SIZE = 200;

let timerRef: ReturnType<typeof setInterval> | null = null;
let workerPaused = false;

const outboxWorkerMetrics = {
  ticks: 0,
  claimedEvents: 0,
  publishedSuccess: 0,
  publishedFailed: 0,
  lastBatchCount: 0,
  lastTickAt: null as string | null,
};

async function runOutboxTick(): Promise<void> {
  if (workerPaused) {
    return;
  }

  outboxWorkerMetrics.ticks += 1;
  outboxWorkerMetrics.lastTickAt = new Date().toISOString();

  try {
    const events = await claimOutboxEvents(BATCH_SIZE);
    outboxWorkerMetrics.lastBatchCount = events.length;

    if (events.length === 0) {
      return;
    }

    outboxWorkerMetrics.claimedEvents += events.length;

    for (const event of events) {
      try {
        await publishAppEvent(event.routingKey, event.payload);
        await markOutboxPublished(event.id);
        outboxWorkerMetrics.publishedSuccess += 1;
      } catch (error) {
        await markOutboxFailed(
          event.id,
          event.attempts,
          error instanceof Error ? error.message : String(error),
        );
        outboxWorkerMetrics.publishedFailed += 1;
      }
    }

    logInfo("Outbox batch processed", {
      count: events.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes("outbox_events")) {
      workerPaused = true;
      logError(
        "Outbox worker paused because outbox table is not ready. Run migration first.",
        {
          message,
        },
      );
      return;
    }

    logError("Outbox worker tick failed", {
      message,
    });
  }
}

export function startOutboxWorker(): void {
  if (timerRef) {
    return;
  }

  timerRef = setInterval(() => {
    void runOutboxTick();
  }, WORKER_INTERVAL_MS);

  workerPaused = false;

  logInfo("Outbox worker started", {
    intervalMs: WORKER_INTERVAL_MS,
    batchSize: BATCH_SIZE,
  });
}

export function stopOutboxWorker(): void {
  if (!timerRef) {
    return;
  }

  clearInterval(timerRef);
  timerRef = null;
  logInfo("Outbox worker stopped");
}

export function getOutboxWorkerRuntimeMetrics() {
  const totalPublishAttempts =
    outboxWorkerMetrics.publishedSuccess + outboxWorkerMetrics.publishedFailed;

  return {
    paused: workerPaused,
    intervalMs: WORKER_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    ticks: outboxWorkerMetrics.ticks,
    claimedEvents: outboxWorkerMetrics.claimedEvents,
    publishedSuccess: outboxWorkerMetrics.publishedSuccess,
    publishedFailed: outboxWorkerMetrics.publishedFailed,
    publishSuccessRate:
      totalPublishAttempts > 0
        ? outboxWorkerMetrics.publishedSuccess / totalPublishAttempts
        : 1,
    lastBatchCount: outboxWorkerMetrics.lastBatchCount,
    lastTickAt: outboxWorkerMetrics.lastTickAt,
  };
}
