import { z } from "zod";

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
});

export const env = envSchema.parse(process.env);

export type AppEnv = z.infer<typeof envSchema>;
