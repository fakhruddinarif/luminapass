import { z } from "zod";

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return value;
};

const envSchema = z.object({
  APP_NAME: z.string().default("luminapass"),
  APP_PORT: z.coerce.number().int().positive().default(3000),
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_DEBUG: z.coerce.boolean().default(false),
  JWT_SECRET: z.string().min(1),
  JSON_REQUEST_LIMIT: z.string().default("10mb"),

  DB_DIALECT: z.literal("postgres").default("postgres"),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().min(1),
  DB_PASS: z.string().min(1),
  DB_NAME: z.string().min(1),

  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().min(1).optional(),

  AMQP_URL: z
    .string()
    .min(1)
    .refine(
      (value) => value.startsWith("amqp://") || value.startsWith("amqps://"),
      {
        message: "AMQP_URL must start with amqp:// or amqps://",
      },
    ),
  AMQP_PORT: z.coerce.number().int().positive().default(5672),
  AMQP_USER: z.string().min(1),
  AMQP_PASS: z.string().min(1),

  EMAIL_FROM: z.string().email().default("no-reply@luminapass.local"),
  EMAIL_TRANSPORT: z.enum(["smtp", "webhook", "log"]).default("smtp"),
  EMAIL_SMTP_HOST: z.string().default("smtp.gmail.com"),
  EMAIL_SMTP_PORT: z.coerce.number().int().positive().default(465),
  EMAIL_SMTP_SECURE: z.coerce.boolean().default(true),
  EMAIL_SMTP_USER: z.preprocess(emptyStringToUndefined, z.string().optional()),
  EMAIL_SMTP_PASS: z.preprocess(emptyStringToUndefined, z.string().optional()),
  EMAIL_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(8),
  EMAIL_RETRY_BASE_SECONDS: z.coerce
    .number()
    .int()
    .min(5)
    .max(3600)
    .default(60),
  EMAIL_WEBHOOK_URL: z.preprocess(
    emptyStringToUndefined,
    z.string().url().optional(),
  ),
});

export const env = envSchema.parse(process.env);

export type AppEnv = z.infer<typeof envSchema>;
