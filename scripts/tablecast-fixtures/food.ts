import { resolveText } from "@tablecast/api/localization";
import {
  dietaryKeys,
  type FoodInformation,
  type FoodProfile,
  type JapaneseAllergen,
  japaneseAllergenSchema,
  type Product,
} from "@tablecast/api/schema";

export type SeedDietary = Record<(typeof dietaryKeys)[number], "no" | "yes"> & {
  halalReason?: "alcohol" | "ingredients_confirmed";
};

// 架空レシピの仕入れ・製造条件。牛肉・鶏肉の仕入れはハラール非対応とする。
const plant = { vegan: "yes", vegetarian: "yes", halal: "yes", glutenFree: "yes" } as const;
const fish = { ...plant, vegan: "no", vegetarian: "no" } as const;
const meat = { ...fish, halal: "no" } as const;
const eggMilk = { ...plant, vegan: "no" } as const;
const alcohol = { ...plant, halal: "no", halalReason: "alcohol" } as const;
export const seedDietary = {
  plant,
  plantGluten: { ...plant, glutenFree: "no" },
  fish,
  fishGluten: { ...fish, glutenFree: "no" },
  meat,
  meatGluten: { ...meat, glutenFree: "no" },
  eggMilk,
  eggMilkGluten: { ...eggMilk, glutenFree: "no" },
  alcohol,
  maltAlcohol: { ...alcohol, glutenFree: "no" },
} as const satisfies Record<string, SeedDietary>;

function recipeFoodProfile(contains: JapaneseAllergen[], states: SeedDietary): FoodProfile {
  const profile: FoodProfile = {
    allergens: {},
    crossContact: "controlled",
    crossContactSources: [],
    halalCertification: "not_certified",
    dietary: {
      vegan: { status: states.vegan, reasons: [] },
      vegetarian: { status: states.vegetarian, reasons: [] },
      halal: { status: states.halal, reasons: [] },
      glutenFree: { status: states.glutenFree, reasons: [] },
    },
  };
  for (const id of japaneseAllergenSchema.options)
    profile.allergens[id] = contains.includes(id) ? "contains" : "not_used";
  for (const key of dietaryKeys) {
    const status = states[key];
    profile.dietary[key] = {
      status,
      reasons: [
        status === "yes"
          ? "ingredients_confirmed"
          : key === "vegan"
            ? "animal_ingredients"
            : key === "vegetarian"
              ? "meat_or_fish"
              : key === "glutenFree"
                ? "gluten_ingredients"
                : contains.includes("pork")
                  ? "pork_ingredients"
                  : (states.halalReason ?? "ingredients_confirmed"),
      ],
    };
  }
  return profile;
}

export function recipeFoodInformation(
  contains: JapaneseAllergen[],
  dietary: SeedDietary,
  category: string,
): FoodInformation {
  const base = recipeFoodProfile(contains, dietary);
  if (!["sake", "drinks", "craft-beer", "soft-drinks", "korean-alcohol"].includes(category)) {
    base.crossContact = "possible";
    base.crossContactSources =
      category === "fried" ? ["shared_equipment", "shared_frying_oil"] : ["shared_equipment"];
  }
  return { base, components: [], defaultComponentIds: [] };
}

const egg = () => recipeFoodProfile(["egg"], eggMilk);
const cheese = () => recipeFoodProfile(["milk"], eggMilk);

export function withDemoFoodChanges(input: Product): Product {
  const product = structuredClone(input);
  // 調味料は酒類・動物性出汁を使わないレシピ。麺はスープ粉末を含まない。
  const additions: [string, FoodProfile][] = [
    ["topping-egg", egg()],
    ["hotpot-extras-cheese", cheese()],
    ["seasoning-tare", recipeFoodProfile(["wheat", "soya"], seedDietary.plantGluten)],
    ["seasoning-ponzu", recipeFoodProfile(["wheat", "soya"], seedDietary.plantGluten)],
    ["hotpot-extras-ramyeon", recipeFoodProfile(["wheat", "egg"], seedDietary.eggMilkGluten)],
    ["broth-bonito", recipeFoodProfile([], seedDietary.fish)],
    ["broth-kombu", recipeFoodProfile([], plant)],
    ["broth-chicken", recipeFoodProfile(["chicken"], seedDietary.meat)],
    ["broth-miso", recipeFoodProfile(["soya"], plant)],
    ["ssamjang-side", recipeFoodProfile(["wheat", "soya"], seedDietary.plantGluten)],
    ["chicken-sauce-yangnyeom", recipeFoodProfile(["wheat", "soya"], seedDietary.plantGluten)],
    ["chicken-sauce-soy-garlic", recipeFoodProfile(["wheat", "soya"], seedDietary.plantGluten)],
    ["chicken-sauce-honey-mustard", recipeFoodProfile(["egg"], seedDietary.eggMilk)],
    ["dip-soy-vinegar", recipeFoodProfile(["wheat", "soya"], seedDietary.plantGluten)],
    ["dip-chilli", recipeFoodProfile(["wheat", "soya"], seedDietary.plantGluten)],
  ];
  const defaults = [
    ["broth", "broth-bonito"],
    ["ssamjang", "ssamjang-side"],
    ["dip", "dip-soy-vinegar"],
  ] as const;
  for (const group of product.modifiers) {
    const defaultEntry = defaults.find(([key]) => group.id.endsWith(`-${key}`));
    const defaultId = defaultEntry ? `tablecast-food-${defaultEntry[1]}` : undefined;
    if (defaultId) product.foodInfo.defaultComponentIds.push(defaultId);
    for (const option of group.options) {
      const entry = additions.find(([suffix]) => option.id.endsWith(`-${suffix}`));
      const id = entry ? `tablecast-food-${entry[0]}` : undefined;
      if (entry && id)
        product.foodInfo.components.push({
          id,
          name: { ja: option.text.ja.displayName, en: resolveText(option.text, "en").displayName },
          profile: entry[1],
        });
      if (id || defaultId)
        option.foodChanges = {
          add: id ? [id] : [],
          remove: defaultId && id !== defaultId ? [defaultId] : [],
        };
    }
  }
  return product;
}

export function koreanFoodInformation(product: Product): Product {
  if (!product.id.endsWith("-bibimbap")) return product;
  const base = {
    ...recipeFoodProfile(["sesame", "soya", "wheat"], seedDietary.plantGluten),
    crossContact: product.foodInfo.base.crossContact,
    crossContactSources: product.foodInfo.base.crossContactSources,
  };
  const info: FoodInformation = {
    base,
    defaultComponentIds: ["beef", "egg"],
    components: [
      {
        id: "beef",
        name: { ja: "牛肉", en: "Beef" },
        profile: recipeFoodProfile(["beef"], seedDietary.meat),
      },
      {
        id: "tofu",
        name: { ja: "豆腐", en: "Tofu" },
        profile: recipeFoodProfile(["soya"], plant),
      },
      { id: "egg", name: { ja: "目玉焼き", en: "Fried egg" }, profile: egg() },
    ],
  };
  product.foodInfo = info;
  const changes: Record<string, { add: string[]; remove: string[] }> = {
    "bibimbap-protein-beef": { add: ["beef"], remove: [] },
    "bibimbap-protein-tofu": { add: ["tofu"], remove: ["beef"] },
    "bibimbap-protein-none": { add: [], remove: ["beef"] },
    "egg-yes": { add: ["egg"], remove: [] },
    "egg-none": { add: [], remove: ["egg"] },
  };
  for (const option of product.modifiers.flatMap((group) => group.options)) {
    const change = Object.entries(changes).find(([suffix]) => option.id.endsWith(`-${suffix}`));
    if (change) option.foodChanges = change[1];
  }
  return product;
}

export function westwardFoodInformation(product: Product): Product {
  const result = structuredClone(product);
  const definitions = {
    brioche: recipeFoodProfile(["wheat", "egg", "milk"], seedDietary.eggMilkGluten),
    wholemeal: recipeFoodProfile(["wheat"], { ...plant, glutenFree: "no" }),
    lettuce: recipeFoodProfile([], plant),
    beef: recipeFoodProfile(["beef"], seedDietary.meat),
    chicken: recipeFoodProfile(["chicken"], seedDietary.meat),
    patties: recipeFoodProfile(["soya"], plant),
    cheddar: cheese(),
    pepperJack: cheese(),
    house: recipeFoodProfile(["egg", "soya"], seedDietary.eggMilk),
    mustard: recipeFoodProfile([], plant),
    bbq: recipeFoodProfile(["wheat", "soya"], { ...plant, glutenFree: "no" }),
    avocado: recipeFoodProfile([], plant),
    bacon: recipeFoodProfile(["pork"], seedDietary.meat),
    onion: recipeFoodProfile([], plant),
    tomato: recipeFoodProfile([], plant),
    pickle: recipeFoodProfile([], plant),
  };
  const names: Record<string, { en: string; ja: string }> = {
    brioche: { ja: "ブリオッシュ", en: "Brioche" },
    wholemeal: { ja: "全粒粉バンズ", en: "Wholemeal bun" },
    lettuce: { ja: "レタス包み", en: "Lettuce wrap" },
    beef: { ja: "ビーフパティ", en: "Beef patty" },
    chicken: { ja: "チキンパティ", en: "Chicken patty" },
    patties: { ja: "植物由来パティ", en: "Plant-based patty" },
    cheddar: { ja: "チェダーチーズ", en: "Cheddar" },
    pepperJack: { ja: "ペッパージャック", en: "Pepper Jack" },
    house: { ja: "ハウスソース", en: "House sauce" },
    mustard: { ja: "マスタードソース", en: "Mustard sauce" },
    bbq: { ja: "BBQソース", en: "BBQ sauce" },
    avocado: { ja: "アボカド", en: "Avocado" },
    bacon: { ja: "ベーコン", en: "Bacon" },
    onion: { ja: "玉ねぎ", en: "Onion" },
    tomato: { ja: "トマト", en: "Tomato" },
    pickle: { ja: "ピクルス", en: "Pickle" },
  };
  const components: FoodInformation["components"] = Object.entries(definitions).map(
    ([id, profile]) => {
      const name = names[id];
      if (!name) throw new Error(`具材名が未登録です: ${id}`);
      return { id, name, profile };
    },
  );
  const changes: Record<string, { add: string[]; remove: string[] }> = {
    "bun-brioche": { add: ["brioche"], remove: [] },
    "bun-wholemeal": { add: ["wholemeal"], remove: ["brioche"] },
    "bun-lettuce": { add: ["lettuce"], remove: ["brioche"] },
    "patty-beef": { add: ["beef"], remove: [] },
    "patty-plant": { add: ["patties"], remove: ["beef"] },
    "cheese-cheddar": { add: ["cheddar"], remove: [] },
    "cheese-none": { add: [], remove: ["cheddar"] },
    "cheese-pepper-jack": { add: ["pepperJack"], remove: ["cheddar"] },
    "sauce-house": { add: ["house"], remove: [] },
    "sauce-mustard": { add: ["mustard"], remove: ["house"] },
    "sauce-bbq": { add: ["bbq"], remove: ["house"] },
    "extras-cheddar": { add: ["cheddar"], remove: [] },
    "extras-avocado": { add: ["avocado"], remove: [] },
    "extras-bacon": { add: ["bacon"], remove: [] },
    "omit-onion": { add: [], remove: ["onion"] },
    "omit-tomato": { add: [], remove: ["tomato"] },
    "omit-pickle": { add: [], remove: ["pickle"] },
  };
  const isBurger = product.categoryId === "burgers";
  result.foodInfo = {
    base: isBurger
      ? {
          ...recipeFoodProfile([], plant),
          crossContact: product.foodInfo.base.crossContact,
          crossContactSources: product.foodInfo.base.crossContactSources,
        }
      : product.foodInfo.base,
    components,
    defaultComponentIds: isBurger
      ? [
          "brioche",
          product.id.endsWith("-chicken-burger")
            ? "chicken"
            : product.id.endsWith("-mushroom-burger")
              ? "patties"
              : "beef",
          "cheddar",
          "house",
          "onion",
          "tomato",
          "pickle",
        ]
      : [],
  };
  for (const option of result.modifiers.flatMap((group) => group.options)) {
    const entry = Object.entries(changes).find(([suffix]) => option.id.endsWith(`-${suffix}`));
    if (entry) option.foodChanges = entry[1];
  }
  // 未使用の具材まで全商品へ複製せず、標準構成と実在する選択肢の参照に絞る。
  const used = new Set([
    ...result.foodInfo.defaultComponentIds,
    ...result.modifiers
      .flatMap((group) => group.options)
      .flatMap((option) => [
        ...(option.foodChanges?.add ?? []),
        ...(option.foodChanges?.remove ?? []),
      ]),
  ]);
  result.foodInfo.components = components.filter((component) => used.has(component.id));
  return result;
}
