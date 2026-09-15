import { z } from "zod";
import { imageMetadataSchema } from "../media/model";
const bilingual = z.object({
  ja: z.string().trim().min(1).max(500),
  en: z.string().trim().min(1).max(500),
});
export const couponRuleSchema = imageMetadataSchema
  .extend({
    title: bilingual,
    description: bilingual,
    imageKey: z.string().regex(/^tablecast\/uploads\/[a-f0-9]{64}\.webp$/),
    startsAt: z.number().int().nonnegative(),
    endsAt: z.number().int().positive(),
    minimumYen: z.number().int().min(0).max(10000000),
    discountKind: z.enum(["fixed", "percent"]),
    discountValue: z.number().int().min(1).max(10000000),
    maximumYen: z.number().int().min(1).max(10000000),
    trigger: z.enum(["enrol", "visits", "spend", "exchange", "manual"]),
    threshold: z.number().int().min(1).max(100000000),
  })
  .refine((v) => v.endsAt > v.startsAt && (v.discountKind !== "percent" || v.discountValue <= 100));
export const couponDefinitionSchema = z.object({
  id: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  active: z.boolean(),
  rules: couponRuleSchema,
});
export const couponPageSchema = z.object({
  beforeId: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const issueCouponSchema = z.object({
  ruleId: z.string().uuid(),
  membershipId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});
export const exchangeCouponSchema = z.object({
  ruleId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
});
export const requestCouponSchema = z.object({ sessionId: z.string().min(1) });
export const applyCouponSchema = z.object({
  couponId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
});
export const cancelCouponUseSchema = z.object({
  useId: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});
export const revokeCouponSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export const rewardMembersSchema = couponPageSchema.extend({
  query: z.string().trim().max(100).default(""),
});
