import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { env } from "./env";
import * as schema from "../entities/schema";

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const db = drizzle({ client: pool, schema });

export async function connectDatabase(): Promise<void> {
  const client = await pool.connect();
  client.release();
}

export async function disconnectDatabase(): Promise<void> {
  await pool.end();
}
