import { z } from "zod";
import { id } from "../../platform/model";

// 消費者庁の2026年4月版。アレルゲンIDはこの29品目だけを受け付ける。
const required = {
  prawn: ["えび", "Prawns"],
  cashew: ["カシューナッツ", "Cashews"],
  crab: ["かに", "Crab"],
  walnut: ["くるみ", "Walnuts"],
  wheat: ["小麦", "Wheat"],
  buckwheat: ["そば", "Buckwheat"],
  egg: ["卵", "Egg"],
  milk: ["乳", "Milk"],
  peanuts: ["落花生", "Peanuts"],
} as const;
const recommended = {
  almond: ["アーモンド", "Almonds"],
  abalone: ["あわび", "Abalone"],
  squid: ["いか", "Squid"],
  salmonRoe: ["いくら", "Salmon roe"],
  orange: ["オレンジ", "Orange"],
  kiwi: ["キウイフルーツ", "Kiwi fruit"],
  beef: ["牛肉", "Beef"],
  sesame: ["ごま", "Sesame"],
  salmon: ["さけ", "Salmon"],
  mackerel: ["さば", "Mackerel"],
  soya: ["大豆", "Soya"],
  chicken: ["鶏肉", "Chicken"],
  banana: ["バナナ", "Banana"],
  pistachio: ["ピスタチオ", "Pistachios"],
  pork: ["豚肉", "Pork"],
  macadamia: ["マカダミアナッツ", "Macadamia nuts"],
  peach: ["もも", "Peach"],
  yam: ["やまいも", "Yam"],
  apple: ["りんご", "Apple"],
  gelatin: ["ゼラチン", "Gelatine"],
} as const;
export const japaneseAllergenSchema = z.enum([
  "prawn",
  "cashew",
  "crab",
  "walnut",
  "wheat",
  "buckwheat",
  "egg",
  "milk",
  "peanuts",
  "almond",
  "abalone",
  "squid",
  "salmonRoe",
  "orange",
  "kiwi",
  "beef",
  "sesame",
  "salmon",
  "mackerel",
  "soya",
  "chicken",
  "banana",
  "pistachio",
  "pork",
  "macadamia",
  "peach",
  "yam",
  "apple",
  "gelatin",
] as const);
export type JapaneseAllergen = z.infer<typeof japaneseAllergenSchema>;
export const foodClassification = {
  version: "jp-2026-04",
  source:
    "https://www.caa.go.jp/policies/policy/food_labeling/food_sanitation/allergy/assets/food_labeling_cms204_260401_01.pdf",
  allergens: japaneseAllergenSchema.options.map((allergen) => {
    const labels = { ...required, ...recommended }[allergen];
    return {
      id: allergen,
      category: allergen in required ? "required" : "recommended",
      name: { ja: labels[0], en: labels[1] },
    };
  }),
} as const;
export const dietaryKeys = ["vegan", "vegetarian", "halal", "glutenFree"] as const;
export const dietaryReasonSchema = z
  .enum([
    "ingredients_confirmed",
    "animal_ingredients",
    "meat_or_fish",
    "gluten_ingredients",
    "pork_ingredients",
    "alcohol",
    "ingredient_origin_unknown",
    "previous_record",
  ])
  .meta({ id: "tablecastDietaryReason" });
const commonDietaryReasons = [
  "ingredients_confirmed",
  "ingredient_origin_unknown",
  "previous_record",
] as const;
export const dietaryReasonsByKind = {
  vegan: [...commonDietaryReasons, "animal_ingredients", "meat_or_fish", "pork_ingredients"],
  vegetarian: [...commonDietaryReasons, "meat_or_fish", "pork_ingredients"],
  halal: [...commonDietaryReasons, "pork_ingredients", "alcohol"],
  glutenFree: [...commonDietaryReasons, "gluten_ingredients"],
} as const;
export const crossContactSourceSchema = z
  .enum(["shared_equipment", "shared_frying_oil", "shared_production_line"])
  .meta({ id: "tablecastCrossContactSource" });
export const halalCertificationSchema = z.enum(["certified", "not_certified", "unknown"]);
export const dietaryAssessmentSchema = z
  .object({
    status: z.enum(["yes", "no", "unknown"]),
    reasons: z.array(dietaryReasonSchema).max(9),
  })
  .strict()
  .refine((value) => value.status === "unknown" || value.reasons.length > 0, {
    path: ["reasons"],
    message: "FOOD_REASON_REQUIRED",
  })
  .meta({ id: "tablecastDietaryAssessment" });
export const foodProfileSchema = z
  .object({
    allergens: z.partialRecord(japaneseAllergenSchema, z.enum(["contains", "not_used", "unknown"])),
    crossContact: z.enum(["possible", "unknown", "controlled"]),
    crossContactSources: z.array(crossContactSourceSchema).max(3),
    halalCertification: halalCertificationSchema,
    dietary: z
      .object({
        vegan: dietaryAssessmentSchema,
        vegetarian: dietaryAssessmentSchema,
        halal: dietaryAssessmentSchema,
        glutenFree: dietaryAssessmentSchema,
      })
      .strict(),
  })
  .strict()
  .refine(
    (value) =>
      dietaryKeys.every((key) =>
        value.dietary[key].reasons.every(
          (reason) =>
            dietaryReasonsByKind[key].some((allowed) => allowed === reason) &&
            (reason === "ingredient_origin_unknown"
              ? value.dietary[key].status === "unknown"
              : commonDietaryReasons.some((common) => common === reason) ||
                value.dietary[key].status === "no"),
        ),
      ),
    { path: ["dietary"], message: "FOOD_REASON_INVALID" },
  )
  .meta({ id: "tablecastFoodProfile" });
export const foodInformationSchema = z
  .object({
    base: foodProfileSchema,
    components: z
      .array(
        z
          .object({
            id,
            name: z
              .object({ ja: z.string().min(1).max(150), en: z.string().min(1).max(150) })
              .strict(),
            profile: foodProfileSchema,
          })
          .strict(),
      )
      .max(60),
    defaultComponentIds: z.array(id).max(60),
  })
  .strict();
export const foodChangesSchema = z
  .object({ add: z.array(id).max(60), remove: z.array(id).max(60) })
  .strict();
export type FoodProfile = z.infer<typeof foodProfileSchema>;
export type FoodInformation = z.infer<typeof foodInformationSchema>;

// 旧snapshotの原本を変えず、保存済みの判定だけを新しいenumへ読み替える。
const previousAssessmentSchema = z
  .object({
    status: z.enum(["yes", "no", "unknown"]),
    basis: z.object({ ja: z.string(), en: z.string() }),
  })
  .strict();
const previousFoodProfileSchema = z
  .object({
    allergens: foodProfileSchema.shape.allergens,
    otherAllergens: z.array(z.string()),
    basis: z.object({ ja: z.string(), en: z.string() }),
    crossContact: foodProfileSchema.shape.crossContact,
    dietary: z
      .object({
        vegan: previousAssessmentSchema,
        vegetarian: previousAssessmentSchema,
        halal: previousAssessmentSchema,
        glutenFree: previousAssessmentSchema,
      })
      .strict(),
  })
  .strict();
export const foodResultSchema = z.union([
  foodProfileSchema,
  previousFoodProfileSchema.transform((value): FoodProfile => {
    const result = unknownFoodProfile();
    result.allergens = value.allergens;
    result.crossContact = value.crossContact;
    for (const key of dietaryKeys)
      result.dietary[key] = {
        status: value.dietary[key].status,
        reasons: value.dietary[key].status === "unknown" ? [] : ["previous_record"],
      };
    return result;
  }),
]);
export function readFoodProfile(value: unknown): FoodProfile {
  return foodResultSchema.parse(value);
}
const unknown = () => ({ status: "unknown" as const, reasons: [] });
export function unknownFoodProfile(): FoodProfile {
  return {
    allergens: {},
    crossContact: "unknown",
    crossContactSources: [],
    halalCertification: "unknown",
    dietary: { vegan: unknown(), vegetarian: unknown(), halal: unknown(), glutenFree: unknown() },
  };
}
