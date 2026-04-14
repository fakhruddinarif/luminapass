import Redis, { type RedisOptions } from "ioredis";

import { env } from "./env";

export type RedisClient = Redis;

export const redisConfig = {
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  lazyConnect: true,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 50, 2_000);
  },
  reconnectOnError(error) {
    return error.message.includes("READONLY") ? 2 : false;
  },
} satisfies RedisOptions;

export const redis = new Redis(redisConfig);

export async function connectRedis(): Promise<RedisClient> {
  if (redis.status === "wait" || redis.status === "end") {
    await redis.connect();
  }

  return redis;
}

export async function disconnectRedis(): Promise<void> {
  if (redis.status !== "end") {
    await redis.quit();
  }
}

export function createRedisClient(
  overrides: Partial<RedisOptions> = {},
): RedisClient {
  return new Redis({
    ...redisConfig,
    ...overrides,
  });
}
