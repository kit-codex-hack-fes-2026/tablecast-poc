import { z } from "zod";
import {
  type FoodInformation,
  japaneseAllergenSchema,
  readFoodProfile,
  unknownFoodProfile,
} from "../catalog/food-model";
import { localizedSchema, mapLocalized } from "../catalog/localization";
import { bilingualSchema } from "../catalog/model";
import { configurationSchema } from "./model";

const legacyAllergensSchema = z
  .object({
    contains: z.array(z.string()),
    evidence: z.enum(["verified", "unknown"]),
    crossContact: z.enum(["possible", "unknown", "controlled"]),
    vegan: z.enum(["yes", "no", "unknown"]),
    note: localizedSchema(z.string()),
  })
  .strict();

const storedConfigurationSchema = z.object({ products: z.array(z.unknown()) }).passthrough();
const storedProductSchema = z
  .object({ foodInfo: z.unknown().optional(), allergens: z.unknown().optional() })
  .passthrough();
const storedFoodInformationSchema = z
  .object({
    base: z.unknown(),
    components: z.array(
      z
        .object({
          profile: z.unknown(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

// 旧記録の含有を保持し、分類全体の不使用確認へ読み替えない。
export function legacyFoodInformation(
  input: z.infer<typeof legacyAllergensSchema>,
): FoodInformation {
  const base = unknownFoodProfile();
  base.crossContact = input.crossContact;
  base.dietary.vegan = {
    status: input.vegan,
    reasons: input.vegan === "unknown" ? [] : ["previous_record"],
  };
  for (const value of input.contains) {
    const parsed = japaneseAllergenSchema.safeParse(value);
    if (parsed.success) base.allergens[parsed.data] = "contains";
  }
  return { base, components: [], defaultComponentIds: [] };
}

export function readConfiguration(value: unknown) {
  const record = storedConfigurationSchema.parse(value);
  return configurationSchema.parse({
    ...record,
    products: record.products.map((product) => {
      const item = storedProductSchema.parse(product);
      const text = mapLocalized(bilingualSchema.parse(item.text), (content) => ({
        ...content,
        transliteration:
          content.transliteration === undefined ? content.displayName : content.transliteration,
      }));
      if (item.foodInfo !== undefined) {
        const info = storedFoodInformationSchema.parse(item.foodInfo);
        return {
          ...item,
          text,
          foodInfo: {
            ...info,
            base: readFoodProfile(info.base),
            components: info.components.map((component) => ({
              ...component,
              profile: readFoodProfile(component.profile),
            })),
          },
        };
      }
      const { allergens, ...rest } = item;
      return {
        ...rest,
        text,
        foodInfo: legacyFoodInformation(legacyAllergensSchema.parse(allergens)),
      };
    }),
  });
}
