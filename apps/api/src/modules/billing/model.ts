import { z } from "zod";

export const billingPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const billingQuerySchema = z.object({
  month: billingPeriodSchema.optional(),
  before: z.string().max(300).optional(),
  search: z.string().max(100).optional(),
});
export const billingRatesSchema = z.object({
  version: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,99}$/),
  markupBps: z.number().int().min(10000).max(1000000),
  basePriceId: z.string().startsWith("price_"),
  meterPriceId: z.string().startsWith("price_"),
  eventName: z.string().min(1),
});
export const providerUsageSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  input_tokens_details: z.object({ cached_tokens: z.number().int().nonnegative() }).optional(),
});
export const billingEventSchema = z.object({
  type: z.string(),
  event_id: z.string().optional(),
  usage: z.object({ seconds: z.number().nonnegative() }).optional(),
  event: z
    .object({
      type: z.string(),
      response: z
        .object({
          id: z.string(),
          model: z.string(),
          service_tier: z.string().nullish(),
          usage: providerUsageSchema.nullish(),
        })
        .optional(),
    })
    .optional(),
});
export type BillingRates = z.infer<typeof billingRatesSchema>;
