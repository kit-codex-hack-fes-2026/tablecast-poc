import type { Modifier } from "@tablecast/api/schema";
import { demoOptionImageKey } from "../tablecast-demo-option-images.ts";
import { bilingual } from "./text.ts";

export function westwardModifiers(storeId: string) {
  const option = (key: string, ja: string, en: string, priceDelta = 0) => ({
    id: `${storeId}-${key}`,
    text: bilingual(ja, en),
    priceDelta,
    available: true,
    imageKey: demoOptionImageKey(`${storeId}-${key}`),
    imageKind: "illustration" as const,
    maxQuantity: 1,
    requires: [],
    excludes: [],
  });
  const bun: Modifier = {
    id: `${storeId}-bun`,
    text: bilingual("バンズ", "Bun"),
    kind: "single",
    min: 1,
    max: 1,
    options: [
      option("bun-brioche", "ブリオッシュ", "Brioche"),
      option("bun-wholemeal", "全粒粉", "Wholemeal", 50),
      option("bun-lettuce", "レタス包み", "Lettuce wrap", -100),
    ],
  };
  const patty: Modifier = {
    id: `${storeId}-patty`,
    text: bilingual("パティ", "Patty"),
    kind: "single",
    min: 1,
    max: 1,
    options: [
      option("patty-beef", "ビーフ", "Beef"),
      option("patty-plant", "植物由来パティ", "Plant-based patty", 150),
    ],
  };
  const cheese: Modifier = {
    id: `${storeId}-cheese`,
    text: bilingual("チーズ", "Cheese"),
    kind: "single",
    min: 1,
    max: 1,
    options: [
      option("cheese-cheddar", "チェダー", "Cheddar"),
      option("cheese-none", "チーズなし", "No cheese", -100),
      option("cheese-pepper-jack", "ペッパージャック", "Pepper Jack", 80),
    ],
  };
  const omit: Modifier = {
    id: `${storeId}-omit`,
    text: bilingual("抜く具材", "Ingredients to leave out"),
    kind: "multiple",
    min: 0,
    max: 3,
    options: [
      option("omit-onion", "玉ねぎ抜き", "No onion"),
      option("omit-tomato", "トマト抜き", "No tomato"),
      option("omit-pickle", "ピクルス抜き", "No pickles"),
    ],
  };
  const sauce: Modifier = {
    id: `${storeId}-sauce`,
    text: bilingual("ソース", "Sauce"),
    kind: "single",
    min: 1,
    max: 1,
    options: [
      option("sauce-house", "ハウスソース", "House sauce"),
      option("sauce-mustard", "マスタード", "Mustard"),
      option("sauce-bbq", "スモーキーBBQ", "Smoky BBQ", 50),
    ],
  };
  const extras: Modifier = {
    id: `${storeId}-extras`,
    text: bilingual("追加トッピング", "Extra toppings"),
    kind: "quantity",
    min: 0,
    max: 4,
    options: [
      option("extras-cheddar", "チェダー追加", "Extra cheddar", 150),
      option("extras-avocado", "アボカド", "Avocado", 200),
      option("extras-bacon", "ベーコン", "Bacon", 250),
    ].map((item) => ({ ...item, maxQuantity: 2 })),
  };
  const serving: Modifier = {
    id: `${storeId}-beer-serving`,
    text: bilingual("ビールの容量", "Beer serving"),
    kind: "single",
    min: 1,
    max: 1,
    options: [
      option("beer-serving-small", "二百八十ミリリットル", "Two hundred and eighty millilitres"),
      option(
        "beer-serving-pint",
        "四百七十三ミリリットル",
        "Four hundred and seventy-three millilitres",
        300,
      ),
    ],
  };
  return { bun, patty, cheese, omit, sauce, extras, serving };
}
