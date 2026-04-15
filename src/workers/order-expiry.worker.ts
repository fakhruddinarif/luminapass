import { redis } from "../config/redis";
import { expireAwaitingPaymentOrders } from "../repositories/ticket-orders.repository";
import { logError, logInfo } from "../utils/logger";

const LOCK_KEY = "lumina:worker:order-expiry:lock";
const LOCK_TTL_MS = 15_000;
const WORKER_INTERVAL_MS = 5_000;

let timerRef: ReturnType<typeof setInterval> | null = null;

async function runOrderExpiryTick(): Promise<void> {
  const lockValue = `${process.pid}:${Date.now()}`;

  const lockResult = await redis.set(
    LOCK_KEY,
    lockValue,
    "PX",
    LOCK_TTL_MS,
    "NX",
  );

  if (lockResult !== "OK") {
    return;
  }

  try {
    const processed = await expireAwaitingPaymentOrders(200);
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
