import { z } from "zod";

export const createPaymentTransactionBodySchema = z.object({
  orderId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(128),
  provider: z.string().trim().min(2).max(64).default("mock"),
  simulatorCode: z.string().trim().max(16).optional(),
});

export const paymentWebhookBodySchema = z
  .object({
    provider: z.string().trim().min(2).max(64),
    providerOrderId: z.string().trim().min(2).max(128).optional(),
    externalTxnId: z.string().trim().min(2).max(128).optional(),
    status: z.enum([
      "authorized",
      "captured",
      "failed",
      "expired",
      "refunded",
      "cancelled",
    ]),
    rawProviderStatus: z.string().trim().max(64).optional(),
    statusMessage: z.string().trim().max(500).optional(),
    paymentType: z.string().trim().max(64).optional(),
    channelCode: z.string().trim().max(64).optional(),
    fraudStatus: z.string().trim().max(32).optional(),
    webhookEventId: z.string().trim().max(128).optional(),
    signatureValid: z.boolean().default(false),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((input) => Boolean(input.providerOrderId || input.externalTxnId), {
    message: "Either providerOrderId or externalTxnId must be provided",
    path: ["providerOrderId"],
  });

export type CreatePaymentTransactionBody = z.infer<
  typeof createPaymentTransactionBodySchema
>;
export type PaymentWebhookBody = z.infer<typeof paymentWebhookBodySchema>;
