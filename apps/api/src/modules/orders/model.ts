import { z } from "zod";
import type { Locale } from "../../platform/model";
import { id, localeSchema } from "../../platform/model";
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
  name: Record<Locale, string>;
  speechName: Record<Locale, string>;
  options: {
    id: string;
    name: Record<Locale, string>;
    speechName: Record<Locale, string>;
    quantity: number;
    priceDelta: number;
  }[];
  unitPrice: number;
  total: number;
  missing: string[];
  planCovered: boolean;
};

export type Cart = { version: number; lines: PricedLine[]; total: number; complete: boolean };

export type Snapshot = {
  id: string;
  tableSessionId: string;
  cartVersion: number;
  configVersion: number;
  lines: PricedLine[];
  total: number;
  locale: Locale;
  text: string;
  expiresAt: number;
  channel: "gui" | "voice";
  status: "pending" | "read" | "invalid" | "submitted";
  createdTurnId: string | null;
  plan: { id: string; name: Record<Locale, string> } | null;
};

export type Order = {
  id: string;
  tableSessionId: string;
  snapshotId: string;
  idempotencyKey: string;
  status: "submitted" | "accepted" | "served" | "cancelled" | "rejected";
  snapshot: Snapshot;
  total: number;
  createdAt: number;
};

export type Bill = {
  orderedTotal: number;
  adjustmentTotal: number;
  paidTotal: number;
  due: number;
  cartTotal: number;
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
