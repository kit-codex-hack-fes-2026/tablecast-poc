import { z } from "zod";

export const customerConsentVersion = 1;
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
