import { z } from "zod";

export const customerConsentVersion = 1;
export const customerMembershipPageSchema = z
  .object({
    beforeJoinedAt: z.coerce.number().int().nonnegative().optional(),
    beforeId: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .refine((page) => (page.beforeJoinedAt === undefined) === (page.beforeId === undefined), {
    message: "会員証のカーソルは日時とIDを組で指定する",
  });
export const enrolCustomerSchema = z.object({ consentVersion: z.literal(customerConsentVersion) });
export const customerPreferencesSchema = z.object({
  revision: z.number().int().positive(),
  shareCompanions: z.boolean(),
  useMemories: z.boolean(),
  saveMemories: z.boolean(),
});
export const customerRevisionSchema = customerPreferencesSchema.pick({ revision: true });

// 店舗スタッフのActorへ変換せず、会員本人の操作だけに使う。
export type CustomerActor = { kind: "customer"; userId: string; storeId: string };
