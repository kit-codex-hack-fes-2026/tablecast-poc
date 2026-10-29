import { z } from "zod";
import { imageMetadataSchema } from "../media/model";
const bilingual = z.object({
  ja: z.string().trim().min(1).max(500),
  en: z.string().trim().min(1).max(500),
});
const couponConditionSchema = z
  .strictObject({
    field: z
      .enum(["visits", "spend", "joinedAt", "lastVisitAt"])
      .describe(
        "visitsは確認済み累計来店数、spendは確認済み会員購入額配分の円、日時はUnixミリ秒。lastVisitAtは直近の確認日時で、来店なしは0。",
      ),
    operator: z.enum(["gte", "lte"]).describe("gteは以上、lteは以下。"),
    value: z.number().int().nonnegative().max(253402268399999),
  })
  .refine(
    (condition) => !["visits", "spend"].includes(condition.field) || condition.value <= 100000000,
  );
export const couponConditionsSchema = z.strictObject({
  all: z.array(couponConditionSchema).max(8).describe("全て満たす条件。空配列なら制約なし。"),
  any: z
    .array(couponConditionSchema)
    .max(8)
    .describe("一つ以上満たす条件。空配列なら制約なし。allとの間はAND。"),
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
    conditions: couponConditionsSchema
      .optional()
      .describe("既存の発行契機と閾値に追加する条件。任意SQLは受け付けない。"),
    presentation: z
      .strictObject({
        layout: z.enum(["landscape", "portrait"]),
        imageFit: z.enum(["cover", "contain"]),
      })
      .optional(),
  })
  .refine((v) => v.endsAt > v.startsAt && (v.discountKind !== "percent" || v.discountValue <= 100));
export const couponDefinitionSchema = z.object({
  id: z.string().uuid(),
  expectedVersion: z.number().int().nonnegative(),
  active: z.boolean(),
  rules: couponRuleSchema,
});
export const couponAudienceSchema = z.object({
  ruleId: z
    .string()
    .uuid()
    .optional()
    .describe("編集中の既存ルールID。既発行件数の確認に使う。新規なら省略。"),
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
