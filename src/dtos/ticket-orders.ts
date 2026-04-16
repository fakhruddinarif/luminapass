import { z } from "zod";

export const createTicketOrderItemInputSchema = z.object({
  eventSectionId: z.string().uuid(),
  quantity: z.number().int().positive().max(10),
});

export const createTicketOrderBodySchema = z.object({
  eventId: z.string().uuid(),
  idempotencyKey: z.string().trim().min(8).max(128),
  items: z.array(createTicketOrderItemInputSchema).min(1).max(10),
  paymentProvider: z.string().trim().min(2).max(64).optional(),
});

export const getTicketOrderParamsSchema = z.object({
  orderId: z.string().uuid(),
});

export const scanTicketUnitParamsSchema = z.object({
  ticketCode: z.string().trim().min(3).max(80),
});

export const listTicketOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(10),
});

export type CreateTicketOrderBody = z.infer<typeof createTicketOrderBodySchema>;
export type CreateTicketOrderItemInput = z.infer<
  typeof createTicketOrderItemInputSchema
>;
export type ListTicketOrdersQuery = z.infer<typeof listTicketOrdersQuerySchema>;
