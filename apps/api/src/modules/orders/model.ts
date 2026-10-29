import { z } from "zod";
import { id, localeSchema } from "../../platform/model";
import { foodResultSchema } from "../catalog/food-model";

export const maxCartLines = 20;

const conditionIssueSchema = z
  .object({
    optionId: id,
    relation: z.enum(["requires", "excludes"]),
  })
  .strict();
export const selectionSchema = z
  .object({ optionId: id, quantity: z.number().int().min(1).max(20) })
  .strict();

export const cartLineSchema = z
  .object({
    id,
    productId: id,
    quantity: z.number().int().min(1).max(20),
    selections: z.array(selectionSchema).max(100),
  })
  .strict();

export const cartUpdateSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    lines: z.array(cartLineSchema).max(maxCartLines),
    dismissProductId: id.optional(),
  })
  .strict();

export type CartLine = z.infer<typeof cartLineSchema>;

export type CartUpdate = z.infer<typeof cartUpdateSchema>;

export type PricedLine = z.infer<typeof pricedLineSchema>;

export type Cart = z.infer<typeof cartSchema>;

export type Snapshot = z.infer<typeof snapshotSchema>;

export type Order = z.infer<typeof orderSchema>;
export const inactiveOrderStatuses = ["cancelled", "rejected"] as const;

export type Bill = z.infer<typeof billSchema>;

export const prepareSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    channel: z.enum(["gui", "voice"]).default("gui"),
  })
  .strict();

export const submitSchema = z
  .object({ snapshotId: id, idempotencyKey: z.string().min(8).max(100), approved: z.literal(true) })
  .strict();

const pricedLineSchema = cartLineSchema.extend({
  name: z.object({ ja: z.string(), en: z.string() }),
  speechName: z.object({ ja: z.string(), en: z.string() }),
  options: z.array(
    z.object({
      id: z.string(),
      name: z.object({ ja: z.string(), en: z.string() }),
      speechName: z.object({ ja: z.string(), en: z.string() }),
      quantity: z.number().int(),
      priceDelta: z.number().int(),
    }),
  ),
  unitPrice: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  missing: z.array(z.string()),
  conditionIssues: z.array(conditionIssueSchema).optional(),
  planCovered: z.boolean(),
  foodInformation: foodResultSchema.optional(),
});

export const snapshotSchema = z.object({
  id: z.string(),
  tableSessionId: z.string(),
  cartVersion: z.number().int(),
  configVersion: z.number().int(),
  lines: z.array(pricedLineSchema),
  total: z.number().int().nonnegative(),
  locale: localeSchema,
  text: z.string(),
  expiresAt: z.number(),
  channel: z.enum(["gui", "voice"]),
  status: z.enum(["pending", "read", "invalid", "submitted"]),
  createdTurnId: z.string().nullable(),
  plan: z.object({ id: z.string(), name: z.object({ ja: z.string(), en: z.string() }) }).nullable(),
});

export const cartSchema = z.object({
  version: z.number().int(),
  lines: z.array(pricedLineSchema),
  total: z.number().int().nonnegative(),
  complete: z.boolean(),
});

export const orderSchema = z.object({
  id: z.string(),
  tableSessionId: z.string(),
  snapshotId: z.string(),
  idempotencyKey: z.string(),
  status: z.enum(["submitted", "accepted", "served", "cancelled", "rejected"]),
  snapshot: snapshotSchema,
  total: z.number().int().nonnegative(),
  createdAt: z.number(),
});

export const billSchema = z.object({
  orderedTotal: z.number().int(),
  adjustmentTotal: z.number().int(),
  paidTotal: z.number().int(),
  due: z.number().int(),
  cartTotal: z.number().int(),
  planTotal: z.number().int(),
});

export const planUsageSchema = z.object({
  quantity: z.number(),
  lastOrderAt: z.number().nullable(),
});
export type PlanUsage = z.infer<typeof planUsageSchema>;
