import { z } from "zod";
import { id, money } from "../../platform/model";
import { imageSourceSchema } from "../media/model";
export const contentSchema = z
  .object({
    displayName: z.string().min(1).max(150),
    speechName: z.string().min(1).max(150),
    description: z.string().max(3000),
    aliases: z.array(z.string().max(100)).max(30).default([]),
  })
  .strict();

export const bilingualSchema = z
  .object({ ja: contentSchema, en: contentSchema })
  .strict()
  .meta({ id: "tablecastBilingualContent" });

const imageFields = {
  imageKey: z
    .string()
    .max(300)
    .regex(/^tablecast\/[a-zA-Z0-9/_-]+\.(png|jpg|webp|svg)$/)
    .nullable()
    .default(null),
  imageKind: z.enum(["photograph", "illustration"]).default("illustration"),
};

export type OptionCondition =
  | { kind: "option"; optionId: string }
  | { kind: "and" | "or"; children: OptionCondition[] }
  | { kind: "not"; child: OptionCondition };

export const conditionLimits = {
  depth: 8,
  children: 8,
  nodes: 64,
  productNodes: 1024,
  configurationNodes: 65536,
} as const;

// 深さをschema自体で有限にし、過剰なネストを再帰parseする前に拒否する。
function conditionAtDepth(depth: number): z.ZodType<OptionCondition> {
  const leaf = z.object({ kind: z.literal("option"), optionId: id }).strict();
  if (depth === conditionLimits.depth) return leaf;
  const child = conditionAtDepth(depth + 1).meta({ id: `tablecastConditionDepth${depth + 1}` });
  return z.discriminatedUnion("kind", [
    leaf,
    z
      .object({
        kind: z.literal("and"),
        children: z.array(child).min(2).max(conditionLimits.children),
      })
      .strict(),
    z
      .object({
        kind: z.literal("or"),
        children: z.array(child).min(2).max(conditionLimits.children),
      })
      .strict(),
    z.object({ kind: z.literal("not"), child }).strict(),
  ]);
}

export function conditionNodeCount(condition: OptionCondition | null): number {
  if (!condition) return 0;
  const pending = [condition];
  let count = 0;
  while (pending.length) {
    const node = pending.pop();
    if (!node) break;
    count++;
    if (node.kind === "not") pending.push(node.child);
    else if (node.kind !== "option") pending.push(...node.children);
  }
  return count;
}

export const optionConditionSchema = conditionAtDepth(1).refine(
  (condition) => conditionNodeCount(condition) <= conditionLimits.nodes,
  { message: "CONDITION_NODE_LIMIT" },
);
export const optionConditionsSchema = z
  .object({
    version: z.literal(2),
    requires: optionConditionSchema.nullable(),
    excludes: optionConditionSchema.nullable(),
  })
  .strict();

export type OptionConditions = z.infer<typeof optionConditionsSchema>;

export const optionSchema = z
  .object({
    id,
    text: bilingualSchema,
    priceDelta: z.number().int().min(-100000).max(100000),
    available: z.boolean(),
    ...imageFields,
    maxQuantity: z.number().int().min(1).max(20).default(1),
    requires: z.array(id).default([]),
    excludes: z.array(id).default([]),
    conditions: optionConditionsSchema.optional(),
  })
  .strict()
  .refine((option) => !option.conditions || (!option.requires.length && !option.excludes.length), {
    path: ["conditions"],
    message: "CONDITION_FORMAT_MIXED",
  });

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
    ...imageFields,
    imageSource: imageSourceSchema.optional(),
    modifiers: z
      .array(modifierSchema)
      .max(12)
      .default([])
      .refine(
        (modifiers) => productConditionNodeCount({ modifiers }) <= conditionLimits.productNodes,
        { message: "CONDITION_PRODUCT_LIMIT" },
      ),
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

export function productConditionNodeCount(product: {
  modifiers: { options: { conditions?: OptionConditions }[] }[];
}): number {
  return product.modifiers.reduce(
    (total, group) =>
      total +
      group.options.reduce(
        (sum, option) =>
          sum +
          conditionNodeCount(option.conditions?.requires ?? null) +
          conditionNodeCount(option.conditions?.excludes ?? null),
        0,
      ),
    0,
  );
}

export type Modifier = z.infer<typeof modifierSchema>;

export type Plan = z.infer<typeof planSchema>;
