import { z } from "zod";
import type { Locale } from "../../platform/model";
import { id, localeSchema } from "../../platform/model";

export const conditionIssueSchema = z
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
    lines: z.array(cartLineSchema).max(100),
  })
  .strict();

export type CartLine = z.infer<typeof cartLineSchema>;

export type CartUpdate = z.infer<typeof cartUpdateSchema>;

export type PricedLine = CartLine & {
  conditionIssues?: {
    optionId: string;
    relation: "excludes" | "requires";
  }[];
  missing: string[];
  name: Record<Locale, string>;
  options: {
    id: string;
    name: Record<Locale, string>;
    priceDelta: number;
    quantity: number;
    speechName: Record<Locale, string>;
  }[];
  planCovered: boolean;
  speechName: Record<Locale, string>;
  total: number;
  unitPrice: number;
};

export type Cart = { complete: boolean; lines: PricedLine[]; total: number; version: number };

export type Snapshot = {
  cartVersion: number;
  channel: "gui" | "voice";
  configVersion: number;
  createdTurnId: null | string;
  expiresAt: number;
  id: string;
  lines: PricedLine[];
  locale: Locale;
  plan: null | { id: string; name: Record<Locale, string> };
  status: "invalid" | "pending" | "read" | "submitted";
  tableSessionId: string;
  text: string;
  total: number;
};

export type Order = {
  createdAt: number;
  id: string;
  idempotencyKey: string;
  snapshot: Snapshot;
  snapshotId: string;
  status: "accepted" | "cancelled" | "rejected" | "served" | "submitted";
  tableSessionId: string;
  total: number;
};

export type Bill = {
  adjustmentTotal: number;
  cartTotal: number;
  due: number;
  orderedTotal: number;
  paidTotal: number;
  planTotal: number;
};

export const prepareSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    channel: z.enum(["gui", "voice"]).default("gui"),
  })
  .strict();

export const submitSchema = z
  .object({ snapshotId: id, idempotencyKey: z.string().min(8).max(100), approved: z.literal(true) })
  .strict();

export const pricedLineSchema: z.ZodType<PricedLine> = cartLineSchema.extend({
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
});

export const snapshotSchema: z.ZodType<Snapshot> = z.object({
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

export const cartSchema: z.ZodType<Cart> = z.object({
  version: z.number().int(),
  lines: z.array(pricedLineSchema),
  total: z.number().int().nonnegative(),
  complete: z.boolean(),
});

export const orderSchema: z.ZodType<Order> = z.object({
  id: z.string(),
  tableSessionId: z.string(),
  snapshotId: z.string(),
  idempotencyKey: z.string(),
  status: z.enum(["submitted", "accepted", "served", "cancelled", "rejected"]),
  snapshot: snapshotSchema,
  total: z.number().int().nonnegative(),
  createdAt: z.number(),
});

export const billSchema: z.ZodType<Bill> = z.object({
  orderedTotal: z.number().int(),
  adjustmentTotal: z.number().int(),
  paidTotal: z.number().int(),
  due: z.number().int(),
  cartTotal: z.number().int(),
  planTotal: z.number().int(),
});
