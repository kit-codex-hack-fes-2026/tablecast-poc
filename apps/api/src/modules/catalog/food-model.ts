import { z } from "zod";
import { id } from "../../platform/model";

// 消費者庁の2026年4月版。分類外の成分はotherAllergensへ分ける。
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
const foodNoteSchema = z
  .object({ ja: z.string(), en: z.string() })
  .strict()
  .meta({ id: "tablecastFoodNote" });
export const dietaryAssessmentSchema = z
  .object({
    status: z.enum(["yes", "no", "unknown"]),
    basis: foodNoteSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.status === "unknown" ||
      (value.basis.ja.trim().length > 0 && value.basis.en.trim().length > 0),
    { path: ["basis"], message: "FOOD_BASIS_REQUIRED" },
  )
  .meta({ id: "tablecastDietaryAssessment" });
export const foodProfileSchema = z
  .object({
    allergens: z.partialRecord(japaneseAllergenSchema, z.enum(["contains", "not_used", "unknown"])),
    otherAllergens: z.array(z.string().trim().min(1).max(100)).max(40),
    basis: foodNoteSchema,
    crossContact: z.enum(["possible", "unknown", "controlled"]),
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
      (value.crossContact === "unknown" &&
        !value.otherAllergens.length &&
        !Object.values(value.allergens).some((status) => status !== "unknown")) ||
      (value.basis.ja.trim().length > 0 && value.basis.en.trim().length > 0),
    { path: ["basis"], message: "FOOD_BASIS_REQUIRED" },
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

// 合算した分類外成分には、元のprofileごとの件数上限を再適用しない。
export const foodResultSchema = foodProfileSchema.safeExtend({
  otherAllergens: z.array(z.string()),
});

const unknown = () => ({ status: "unknown" as const, basis: { ja: "", en: "" } });
export function unknownFoodProfile(): FoodProfile {
  return {
    allergens: {},
    otherAllergens: [],
    basis: { ja: "", en: "" },
    crossContact: "unknown",
    dietary: { vegan: unknown(), vegetarian: unknown(), halal: unknown(), glutenFree: unknown() },
  };
}
