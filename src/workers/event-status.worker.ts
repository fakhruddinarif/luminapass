import { eventsService } from "../services/events.service";
import { logError, logInfo } from "../utils/logger";

const WORKER_INTERVAL_MS = 60_000;
const BATCH_SIZE = 200;

let timerRef: ReturnType<typeof setInterval> | null = null;

const eventStatusWorkerMetrics = {
  ticks: 0,
  totalUpdatedEvents: 0,
  lastUpdatedCount: 0,
  lastTickAt: null as string | null,
  failures: 0,
};

async function runEventStatusTick(): Promise<void> {
  eventStatusWorkerMetrics.ticks += 1;
  eventStatusWorkerMetrics.lastTickAt = new Date().toISOString();

  try {
    const updatedCount =
      await eventsService.synchronizeAutoEventStatuses(BATCH_SIZE);
    eventStatusWorkerMetrics.lastUpdatedCount = updatedCount;
    eventStatusWorkerMetrics.totalUpdatedEvents += updatedCount;

    if (updatedCount > 0) {
      logInfo("Event status worker updated events", { updatedCount });
    }
  } catch (error) {
    eventStatusWorkerMetrics.failures += 1;
    logError("Event status worker tick failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function startEventStatusWorker(): void {
  if (timerRef) {
    return;
  }

  timerRef = setInterval(() => {
    void runEventStatusTick();
  }, WORKER_INTERVAL_MS);

  logInfo("Event status worker started", {
    intervalMs: WORKER_INTERVAL_MS,
    batchSize: BATCH_SIZE,
  });
}

export function stopEventStatusWorker(): void {
  if (!timerRef) {
    return;
  }

  clearInterval(timerRef);
  timerRef = null;
  logInfo("Event status worker stopped");
}

export function getEventStatusWorkerRuntimeMetrics() {
  return {
    intervalMs: WORKER_INTERVAL_MS,
    batchSize: BATCH_SIZE,
    ticks: eventStatusWorkerMetrics.ticks,
    totalUpdatedEvents: eventStatusWorkerMetrics.totalUpdatedEvents,
    lastUpdatedCount: eventStatusWorkerMetrics.lastUpdatedCount,
    lastTickAt: eventStatusWorkerMetrics.lastTickAt,
    failures: eventStatusWorkerMetrics.failures,
  };
}
