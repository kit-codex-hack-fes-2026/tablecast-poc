import { z } from "zod";
export const customerMemoryPageSchema = z.object({
  beforeId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const customerMemoryInputSchema = z.object({
  id: z.string().uuid(),
  revision: z.number().int().nonnegative(),
  content: z.string().trim().min(1).max(1000),
});
export const customerMemoryDeleteSchema = z.object({ revision: z.number().int().positive() });
export const customerTargetSchema = z.object({
  token: z.string().uuid(),
  participantId: z.string().uuid().nullable(),
});
export const customerConsumptionSchema = z.object({
  orderId: z.string().min(1),
  lineId: z.string().min(1),
  quantity: z.number().int().min(0).max(99),
  shared: z.boolean(),
  revision: z.number().int().nonnegative(),
});
export const customerAttributionSchema = customerConsumptionSchema.extend({
  participantId: z.string().uuid(),
});
export const saveCustomerMemorySchema = z.object({
  sourceId: z.string().min(1),
  quote: z.string().trim().min(1).max(1000),
  clearFirstPersonPreference: z.literal(true),
});
export const customerSuggestionsSchema = z.object({
  kind: z.enum(["usual", "untried", "companions"]),
  offset: z.number().int().min(0).max(1000).default(0),
});
