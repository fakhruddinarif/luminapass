import { z } from "zod";

export const registerBodySchema = z.object({
  email: z.string().email().max(255),
  username: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[a-zA-Z0-9_.-]+$/, {
      message:
        "Username may only contain letters, numbers, underscore, dot, or dash",
    }),
  fullName: z.string().trim().min(2).max(160),
  password: z
    .string()
    .min(8)
    .max(128)
    .regex(/[A-Z]/, { message: "Password must include an uppercase letter" })
    .regex(/[a-z]/, { message: "Password must include a lowercase letter" })
    .regex(/[0-9]/, { message: "Password must include a number" }),
  phone: z.string().trim().min(8).max(32).optional(),
  avatarUrl: z.string().url().max(1024).optional(),
});

export const loginBodySchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
});

export const accessTokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["customer", "admin"]),
  jti: z.string().uuid(),
  iat: z.number().int().positive(),
  exp: z.number().int().positive(),
});

export type RegisterBody = z.infer<typeof registerBodySchema>;
export type LoginBody = z.infer<typeof loginBodySchema>;
export type AccessTokenPayload = z.infer<typeof accessTokenPayloadSchema>;
