import { z } from "zod";
import { decimalQuerySchema, id, localeSchema } from "../../platform/model";
import { appearanceSchema, bannerSchema, brandingSchema } from "../appearance/model";
import { localizedSchema } from "../catalog/localization";
import {
  bilingualSchema,
  conditionLimits,
  modifierSchema,
  planSchema,
  productConditionNodeCount,
  productSchema,
} from "../catalog/model";
import { imageAssetsSchema } from "../media/model";
import { selectionSchema } from "../orders/model";
import { castInstructionSchema, instructionLimit } from "./instruction-model";
import { storeSkillsSchema } from "./knowledge-model";
export const guideSchema = z
  .object({
    id,
    text: bilingualSchema,
    productIds: z.array(id).max(20).default([]),
    links: z
      .array(
        z
          .object({
            label: localizedSchema(z.string().min(1).max(150)),
            url: z
              .url()
              .max(2048)
              .refine((value) => new URL(value).protocol === "https:"),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict();
export type Guide = z.infer<typeof guideSchema>;
export const maxConfigurationProducts = 2000;
export const configurationSchema = z
  .object({
    guides: z.array(guideSchema).max(100).optional(),
    languages: z
      .array(localeSchema)
      .min(2)
      .max(100)
      .refine(
        (languages) =>
          languages.includes("ja") &&
          languages.includes("en") &&
          new Set(languages).size === languages.length,
        { message: "日本語・英語を含む重複のない言語を指定してください。" },
      )
      .default(["ja", "en"]),
    branding: brandingSchema.optional(),
    appearance: appearanceSchema.optional(),
    banners: z.array(bannerSchema).max(12).optional(),
    storeName: z.string().trim().min(1).max(150).optional(),
    categories: z.array(z.object({ id, text: bilingualSchema }).strict()).max(100),
    products: z
      .array(productSchema)
      .max(maxConfigurationProducts)
      .refine(
        (products) =>
          products.reduce((sum, product) => sum + productConditionNodeCount(product), 0) <=
          conditionLimits.configurationNodes,
        { message: "CONDITION_CONFIGURATION_LIMIT" },
      ),
    plans: z.array(planSchema).max(30),
    cast: z
      .object({
        skills: storeSkillsSchema.optional(),
        systemInstructions: localizedSchema(
          z.string().trim().min(1).max(instructionLimit).nullable(),
        ).optional(),
        instructions: localizedSchema(castInstructionSchema),
        voice: localizedSchema(z.string().min(1).max(100).nullable()),
        openingInstructions: localizedSchema(z.string().max(2000)).optional(),
        proactive: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type Configuration = z.infer<typeof configurationSchema>;

export const conditionPreviewSchema = z
  .object({
    product: productSchema,
    optionId: id,
    selections: z.array(selectionSchema).max(100),
  })
  .strict();

const configurationIssueBase = z.object({
  path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
});

export const configurationIssueSchema = z.discriminatedUnion("code", [
  configurationIssueBase.extend({
    code: z.literal("KNOWLEDGE_INVALID"),
    params: z.object({ skillId: z.string(), file: z.string(), issue: z.string() }).strict(),
  }),
  configurationIssueBase.extend({
    code: z.literal("FOOD_COMPONENT_INVALID"),
    params: z.object({ id: z.string() }).strict(),
  }),
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

export type ConfigDraft = Omit<z.infer<typeof configDraftSchema>, "changes"> & {
  changes: { after: unknown; before: unknown; path: string; sensitive: boolean }[];
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
  sections: z.array(
    z.enum([
      "languages",
      "guides",
      "products",
      "categories",
      "plans",
      "cast",
      "storeName",
      "branding",
      "appearance",
      "banners",
    ]),
  ),
});
export const draftChoicesPageSchema = z.object({
  drafts: z.array(draftChoiceSchema),
  publishedVersion: z.number().int(),
  nextCursor: z.object({ beforeUpdatedAt: z.number().int(), beforeId: z.string() }).nullable(),
});

const configurationChangesSchema = z.array(
  z.object({ path: z.string(), before: z.json(), after: z.json(), sensitive: z.boolean() }),
);

export const configDraftSchema = z.object({
  imageAssets: imageAssetsSchema.optional(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
  id: z.string(),
  storeId: z.string(),
  baseVersion: z.number().int(),
  version: z.number().int(),
  status: z.enum(["draft", "ready", "published", "discarded"]),
  configuration: configurationSchema,
  errors: z.array(configurationIssueSchema),
  changes: configurationChangesSchema,
});

export type Catalog = z.infer<typeof catalogSchema>;

export const catalogSchema = z.object({
  imageAssets: imageAssetsSchema.optional(),
  storeId: z.string(),
  storeName: z.string(),
  version: z.number().int(),
  configuration: configurationSchema,
});

export const configurationHistoryQuerySchema = z
  .object({
    beforeAt: decimalQuerySchema.pipe(z.number().int().nonnegative()).optional(),
    beforeKind: z.enum(["release", "draft"]).optional(),
    beforeId: id.optional(),
  })
  .strict()
  .refine(
    (query) => {
      const values = [query.beforeAt, query.beforeKind, query.beforeId];
      return (
        values.every((value) => value === undefined) || values.every((value) => value !== undefined)
      );
    },
    { path: ["beforeId"] },
  );

const configurationHistoryEntrySchema = z.object({
  kind: z.enum(["release", "draft"]),
  id: z.string(),
  version: z.number().int(),
  baseVersion: z.number().int().nullable(),
  sourceDraftId: z.string().nullable(),
  restoredFromVersion: z.number().int().nullable(),
  status: z.enum(["draft", "ready", "published", "discarded"]),
  at: z.number().int(),
  actorId: z.string(),
  actorName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  actorImage: z.string().nullable(),
});
export const configurationHistoryPageSchema = z.object({
  entries: z.array(configurationHistoryEntrySchema),
  publishedVersion: z.number().int(),
  nextCursor: z
    .object({
      beforeAt: z.number().int(),
      beforeKind: z.enum(["release", "draft"]),
      beforeId: z.string(),
    })
    .nullable(),
});
export const configurationReleaseSchema = z.object({
  version: z.number().int(),
  publishedVersion: z.number().int(),
  sourceDraftId: z.string().nullable(),
  publishedAt: z.number().int(),
  publishedBy: z.string(),
  publisherName: z.string().nullable(),
  publisherEmail: z.string().nullable(),
  publisherImage: z.string().nullable(),
  configuration: configurationSchema.nullable(),
  changes: configurationChangesSchema,
});
export const configurationRestoreSchema = z
  .object({
    draftId: z.uuid(),
    baseVersion: z.number().int().positive(),
  })
  .strict();
export type ConfigurationHistoryEntry = z.infer<typeof configurationHistoryEntrySchema>;
export type ConfigurationHistoryPage = z.infer<typeof configurationHistoryPageSchema>;
export type ConfigurationRelease = Omit<z.infer<typeof configurationReleaseSchema>, "changes"> &
  Pick<ConfigDraft, "changes">;

export const draftUpdateSchema = z
  .object({
    expectedVersion: z.number().int(),
    configuration: configurationSchema,
    instructionFormatVersion: z.literal(1).optional(),
  })
  .strict();
export const draftPublishSchema = z
  .object({
    expectedVersion: z.number().int(),
    baseVersion: z.number().int(),
    idempotencyKey: z.string().min(8).max(100),
    approved: z.literal(true),
  })
  .strict();

export const foodPreviewSchema = z
  .object({ product: productSchema, selections: z.array(selectionSchema).max(100) })
  .strict();
