import type { Config } from "drizzle-kit";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(): Record<string, string> {
  const parsed: Record<string, string> = {};
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return parsed;
  }

  const content = readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    parsed[key] = value;
    process.env[key] = value;
  }

  return parsed;
}

const fileEnv = loadEnvFile();

function readConfigValue(key: string, fallback: string): string {
  return fileEnv[key] ?? process.env[key] ?? fallback;
}

function buildConnectionUrl(): string {
  const host = readConfigValue("DB_HOST", "localhost");
  const port = readConfigValue("DB_PORT", "5432");
  const user = encodeURIComponent(readConfigValue("DB_USER", "postgres"));
  const password = encodeURIComponent(readConfigValue("DB_PASS", "postgres"));
  const database = encodeURIComponent(readConfigValue("DB_NAME", "postgres"));

  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export default {
  schema: "./src/entities/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: buildConnectionUrl(),
  },
  verbose: true,
  strict: true,
} satisfies Config;
