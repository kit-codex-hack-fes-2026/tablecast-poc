import { z } from "zod";
import { id, money } from "../../platform/model";
export const contentSchema = z
  .object({
    displayName: z.string().min(1).max(150),
    speechName: z.string().min(1).max(150),
    description: z.string().max(3000),
    aliases: z.array(z.string().max(100)).max(30).default([]),
  })
  .strict();

export const bilingualSchema = z.object({ ja: contentSchema, en: contentSchema }).strict();

export const optionSchema = z
  .object({
    id,
    text: bilingualSchema,
    priceDelta: z.number().int().min(-100000).max(100000),
    available: z.boolean(),
    maxQuantity: z.number().int().min(1).max(20).default(1),
    requires: z.array(id).default([]),
    excludes: z.array(id).default([]),
  })
  .strict();

export const modifierSchema = z
  .object({
    id,
    text: bilingualSchema,
    kind: z.enum(["single", "multiple", "quantity"]),
    min: z.number().int().min(0).max(20),
    max: z.number().int().min(1).max(20),
    options: z.array(optionSchema).min(1).max(30),
  })
  .strict();

export const productSchema = z
  .object({
    id,
    categoryId: id,
    text: bilingualSchema,
    price: money,
    available: z.boolean(),
    tags: z.array(id).default([]),
    imageKey: z.string().max(300).nullable().default(null),
    imageKind: z.enum(["photograph", "illustration"]).default("illustration"),
    modifiers: z.array(modifierSchema).max(12).default([]),
    allergens: z
      .object({
        contains: z.array(z.string()),
        evidence: z.enum(["verified", "unknown"]),
        crossContact: z.enum(["possible", "unknown", "controlled"]),
        vegan: z.enum(["yes", "no", "unknown"]),
        note: z.object({ ja: z.string(), en: z.string() }),
      })
      .strict(),
  })
  .strict();

export const planSchema = z
  .object({
    id,
    text: bilingualSchema,
    pricePerPerson: money,
    durationMinutes: z.number().int().positive().max(1440),
    lastOrderMinutesBeforeEnd: z.number().int().nonnegative(),
    productIds: z.array(id),
    categoryIds: z.array(id),
    tags: z.array(id),
    maxPerOrder: z.number().int().positive().max(100),
    maxTotalPerPerson: z.number().int().positive().max(1000),
    intervalSeconds: z.number().int().nonnegative().max(3600),
    excludedOptionIds: z.array(id),
    includedOptionSurcharge: z.boolean(),
  })
  .strict();

export type Product = z.infer<typeof productSchema>;

export type Modifier = z.infer<typeof modifierSchema>;

export type Plan = z.infer<typeof planSchema>;
