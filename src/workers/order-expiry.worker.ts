import { redis } from "../config/redis";
import { expireAwaitingPaymentOrders } from "../services/ticket-orders.service";
import { logError, logInfo } from "../utils/logger";

const LOCK_KEY = "lumina:worker:order-expiry:lock";
const LOCK_TTL_MS = 15_000;
const WORKER_INTERVAL_MS = 5_000;

let timerRef: ReturnType<typeof setInterval> | null = null;

const orderExpiryWorkerMetrics = {
  ticks: 0,
  lockMisses: 0,
  totalExpiredOrdersProcessed: 0,
  lastProcessedCount: 0,
  lastTickAt: null as string | null,
};

async function runOrderExpiryTick(): Promise<void> {
  orderExpiryWorkerMetrics.ticks += 1;
  orderExpiryWorkerMetrics.lastTickAt = new Date().toISOString();

  const lockValue = `${process.pid}:${Date.now()}`;

  const lockResult = await redis.set(
    LOCK_KEY,
    lockValue,
    "PX",
    LOCK_TTL_MS,
    "NX",
  );

  if (lockResult !== "OK") {
    orderExpiryWorkerMetrics.lockMisses += 1;
    return;
  }

  try {
    const processed = await expireAwaitingPaymentOrders(200);
    orderExpiryWorkerMetrics.lastProcessedCount = processed;
    orderExpiryWorkerMetrics.totalExpiredOrdersProcessed += processed;
    if (processed > 0) {
      logInfo("Expired orders processed", { processed });
    }
  } catch (error) {
    logError("Order expiry worker tick failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

export function startOrderExpiryWorker(): void {
  if (timerRef) {
    return;
  }

  timerRef = setInterval(() => {
    void runOrderExpiryTick();
  }, WORKER_INTERVAL_MS);

  logInfo("Order expiry worker started", {
    intervalMs: WORKER_INTERVAL_MS,
  });
}

export function stopOrderExpiryWorker(): void {
  if (!timerRef) {
    return;
  }

  clearInterval(timerRef);
  timerRef = null;
  logInfo("Order expiry worker stopped");
}

export function getOrderExpiryWorkerRuntimeMetrics() {
  return {
    intervalMs: WORKER_INTERVAL_MS,
    lockTtlMs: LOCK_TTL_MS,
    ticks: orderExpiryWorkerMetrics.ticks,
    lockMisses: orderExpiryWorkerMetrics.lockMisses,
    totalExpiredOrdersProcessed:
      orderExpiryWorkerMetrics.totalExpiredOrdersProcessed,
    lastProcessedCount: orderExpiryWorkerMetrics.lastProcessedCount,
    lastTickAt: orderExpiryWorkerMetrics.lastTickAt,
  };
}
