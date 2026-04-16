import { z } from "zod";

export const eventSectionInputSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  price: z.number().nonnegative(),
  capacity: z.number().int().nonnegative(),
});

export const createEventBodySchema = z.object({
  slug: z.string().trim().min(3).max(180),
  name: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  venueName: z.string().trim().min(2).max(200),
  venueCity: z.string().trim().min(2).max(120),
  venueAddress: z.string().trim().max(500).optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  saleStartsAt: z.coerce.date(),
  saleEndsAt: z.coerce.date().optional(),
  status: z
    .enum([
      "draft",
      "published",
      "on_sale",
      "sold_out",
      "live",
      "finished",
      "cancelled",
    ])
    .optional(),
  coverImageUrl: z.string().url().max(1024).optional(),
  livestreamEnabled: z.boolean().optional(),
  sections: z.array(eventSectionInputSchema).default([]),
});

export const updateEventBodySchema = createEventBodySchema
  .omit({ sections: true })
  .partial();

export const stockOverrideBodySchema = z.object({
  action: z.enum(["add", "withdraw"]),
  quantity: z.number().int().positive(),
  reason: z.string().trim().min(3).max(300),
});

export const liveDashboardQuerySchema = z.object({
  eventId: z.string().uuid().optional(),
  topResolutionLimit: z.coerce.number().int().min(1).max(10).optional(),
});

export const listEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).optional(),
  filter_status: z
    .enum([
      "draft",
      "published",
      "on_sale",
      "sold_out",
      "live",
      "finished",
      "cancelled",
    ])
    .optional(),
});

export type EventSectionInput = z.infer<typeof eventSectionInputSchema>;
export type CreateEventBody = z.infer<typeof createEventBodySchema>;
export type UpdateEventBody = z.infer<typeof updateEventBodySchema>;
export type StockOverrideBody = z.infer<typeof stockOverrideBodySchema>;
export type LiveDashboardQuery = z.infer<typeof liveDashboardQuerySchema>;
export type ListEventsQuery = z.infer<typeof listEventsQuerySchema>;
