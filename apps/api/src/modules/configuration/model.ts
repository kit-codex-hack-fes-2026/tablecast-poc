import { z } from "zod";
import { castInstructionSchema } from "./instruction-model";
import { decimalQuerySchema, id, localeSchema } from "../../platform/model";
import { bilingualSchema, modifierSchema, planSchema, productSchema } from "../catalog/model";
export const configurationSchema = z
  .object({
    storeName: z.string().trim().min(1).max(150).optional(),
    categories: z.array(z.object({ id, text: bilingualSchema }).strict()).max(100),
    products: z.array(productSchema).max(2000),
    plans: z.array(planSchema).max(30),
    cast: z
      .object({
        instructions: z.object({ ja: castInstructionSchema, en: castInstructionSchema }),
        openingInstructions: z
          .object({ ja: z.string().max(5000), en: z.string().max(5000) })
          .strict()
          .optional(),
        voice: z.object({
          ja: z.string().min(1).max(100).nullable(),
          en: z.string().min(1).max(100).nullable(),
        }),
        proactive: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type Configuration = z.infer<typeof configurationSchema>;

export const configurationIssueBase = z.object({
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
});

export const configurationIssueSchema = z.discriminatedUnion("code", [
  configurationIssueBase.extend({
    code: z.literal("DUPLICATE_ID"),
    params: z.object({ id: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("CATEGORY_NOT_FOUND"),
    params: z.object({ categoryId: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("MODIFIER_SELECTION_RANGE"),
    params: z
      .object({ min: z.number(), max: z.number(), kind: modifierSchema.shape.kind })
      .strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("MODIFIER_CAPACITY"),
    params: z.object({ max: z.number(), capacity: z.number() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("OPTION_REFERENCE_INVALID"),
    params: z
      .object({
        optionId: z.string(),
        referenceId: z.string(),
        relation: z.enum(["requires", "excludes"]),
      })
      .strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("PLAN_LAST_ORDER_INVALID"),
    params: z
      .object({ durationMinutes: z.number(), lastOrderMinutesBeforeEnd: z.number() })
      .strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("PLAN_TARGET_EMPTY"),
    params: z.object({}).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("PRODUCT_NOT_FOUND"),
    params: z.object({ productId: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("OPTION_NOT_FOUND"),
    params: z.object({ optionId: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("VOICE_NOT_FOUND"),
    params: z.object({ voiceId: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("VOICE_NOT_STANDARD"),
    params: z.object({ voiceId: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("VOICE_LANGUAGE_MISMATCH"),
    params: z.object({ voiceId: z.string(), locale: localeSchema, langCode: z.string() }).strict(),
  }),
]);

export type ConfigurationIssue = z.infer<typeof configurationIssueSchema>;

export type ConfigDraft = {
  id: string;
  storeId: string;
  baseVersion: number;
  version: number;
  status: "draft" | "ready" | "published" | "discarded";
  configuration: Configuration;
  errors: ConfigurationIssue[];
  createdAt: number;
  updatedAt: number;
  changes: { path: string; before: unknown; after: unknown; sensitive: boolean }[];
};

export const draftChoicesQuerySchema = z
  .object({
    beforeUpdatedAt: decimalQuerySchema.pipe(z.number().int().nonnegative()).optional(),
    beforeId: id.optional(),
  })
  .strict()
  .refine((query) => (query.beforeUpdatedAt === undefined) === (query.beforeId === undefined), {
    path: ["beforeId"],
  });
export type DraftChoicesQuery = z.infer<typeof draftChoicesQuerySchema>;

export const draftChoiceSchema = z.object({
  id: z.string(),
  baseVersion: z.number().int(),
  version: z.number().int(),
  status: z.enum(["draft", "ready", "published", "discarded"]),
  updatedAt: z.number().int(),
  changeCount: z.number().int(),
  sections: z.array(z.enum(["products", "categories", "plans", "cast", "storeName"])),
});
export const draftChoicesPageSchema = z.object({
  drafts: z.array(draftChoiceSchema),
  publishedVersion: z.number().int(),
  nextCursor: z.object({ beforeUpdatedAt: z.number().int(), beforeId: z.string() }).nullable(),
});

export const configDraftSchema: z.ZodType<ConfigDraft> = z.object({
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  id: z.string(),
  storeId: z.string(),
  baseVersion: z.number().int(),
  version: z.number().int(),
  status: z.enum(["draft", "ready", "published", "discarded"]),
  configuration: configurationSchema,
  errors: z.array(configurationIssueSchema),
  changes: z.array(
    z.object({ path: z.string(), before: z.json(), after: z.json(), sensitive: z.boolean() }),
  ),
});

export type Catalog = {
  storeId: string;
  storeName: string;
  version: number;
  configuration: Configuration;
};

export const catalogSchema: z.ZodType<Catalog> = z.object({
  storeId: z.string(),
  storeName: z.string(),
  version: z.number().int(),
  configuration: configurationSchema,
});
