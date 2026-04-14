import type { Config } from "drizzle-kit";

export default {
  schema: "./src/entities/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  verbose: true,
  strict: true,
} satisfies Config;
