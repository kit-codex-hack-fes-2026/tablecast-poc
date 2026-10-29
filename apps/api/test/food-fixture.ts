import {
  type FoodProfile,
  type JapaneseAllergen,
  japaneseAllergenSchema,
  type Product,
  unknownFoodProfile,
} from "../src/schema";
import { configuration, text } from "./configuration-fixture";

export function profile(contains: JapaneseAllergen[] = []): FoodProfile {
  const value = unknownFoodProfile();
  value.basis = { ja: "試験の登録原材料", en: "Recorded test ingredients" };
  for (const id of japaneseAllergenSchema.options)
    value.allergens[id] = contains.includes(id) ? "contains" : "not_used";
  for (const key of ["vegan", "vegetarian", "halal", "glutenFree"] as const)
    value.dietary[key] = { status: "yes", basis: value.basis };
  value.crossContact = "controlled";
  return value;
}

export function foodProduct(): Product {
  const template = configuration.products[0];
  if (!template) throw new Error("商品fixtureがありません");
  const milk = profile(["milk"]);
  milk.dietary.vegan.status = "no";
  const bun = profile(["milk", "wheat"]);
  bun.dietary.vegan.status = "no";
  bun.dietary.glutenFree.status = "no";
  return {
    ...structuredClone(template),
    id: "tablecast-food-burger",
    foodInfo: {
      base: profile(),
      components: [
        {
          id: "bun",
          name: { ja: "乳入りバンズ", en: "Milk bun" },
          profile: bun,
        },
        { id: "cheese", name: { ja: "チーズ", en: "Cheese" }, profile: milk },
        { id: "lettuce", name: { ja: "レタス", en: "Lettuce" }, profile: profile() },
      ],
      defaultComponentIds: ["bun", "cheese"],
    },
    modifiers: [
      {
        id: "changes",
        text: text("変更", "Changes"),
        kind: "multiple",
        min: 0,
        max: 3,
        options: [
          {
            id: "no-cheese",
            text: text("チーズなし", "No cheese"),
            priceDelta: 0,
            available: true,
            imageKey: null,
            imageKind: "illustration",
            maxQuantity: 1,
            requires: [],
            excludes: [],
            foodChanges: { add: [], remove: ["cheese"] },
          },
          {
            id: "lettuce",
            text: text("レタス包み", "Lettuce wrap"),
            priceDelta: 0,
            available: true,
            imageKey: null,
            imageKind: "illustration",
            maxQuantity: 1,
            requires: [],
            excludes: [],
            foodChanges: { add: ["lettuce"], remove: ["bun"] },
          },
          {
            id: "extra-cheese",
            text: text("チーズ追加", "Extra cheese"),
            priceDelta: 100,
            available: true,
            imageKey: null,
            imageKind: "illustration",
            maxQuantity: 1,
            requires: [],
            excludes: [],
            foodChanges: { add: ["cheese"], remove: [] },
          },
        ],
      },
    ],
  };
}
