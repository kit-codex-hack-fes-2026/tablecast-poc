import {
  dietaryKeys,
  type FoodInformation,
  type FoodProfile,
  type JapaneseAllergen,
  japaneseAllergenSchema,
  type Product,
  unknownFoodProfile,
} from "@tablecast/api/schema";

// 登録した原材料と確認範囲からprofileを作り、未確認の判定は補わない。
function recipeFoodProfile(
  contains: JapaneseAllergen[],
  states: Partial<Record<(typeof dietaryKeys)[number], "no" | "unknown" | "yes">> = {},
  complete = true,
): FoodProfile {
  const profile = unknownFoodProfile();
  for (const id of japaneseAllergenSchema.options)
    if (complete || contains.includes(id))
      profile.allergens[id] = contains.includes(id) ? "contains" : "not_used";
  for (const key of dietaryKeys) {
    const status = states[key] ?? "unknown";
    profile.dietary[key] = {
      status,
      reasons:
        status === "unknown"
          ? []
          : [
              status === "yes"
                ? "ingredients_confirmed"
                : key === "vegan"
                  ? "animal_ingredients"
                  : key === "vegetarian"
                    ? "meat_or_fish"
                    : key === "glutenFree"
                      ? "gluten_ingredients"
                      : "pork_ingredients",
            ],
    };
  }
  return profile;
}

const plant = { vegan: "yes", vegetarian: "yes", glutenFree: "yes" } as const;
const egg = () => recipeFoodProfile(["egg"], { vegan: "no", vegetarian: "yes", glutenFree: "yes" });
const cheese = () =>
  recipeFoodProfile(["milk"], { vegan: "no", vegetarian: "yes", glutenFree: "yes" });

export function withDemoFoodChanges(input: Product): Product {
  const product = structuredClone(input);
  const additions: [string, FoodProfile][] = [
    ["-topping-egg", egg()],
    ["-hotpot-extras-cheese", cheese()],
    [
      "-seasoning-tare",
      recipeFoodProfile(
        ["wheat", "soya"],
        { vegan: "unknown", vegetarian: "unknown", glutenFree: "no" },
        false,
      ),
    ],
    [
      "-hotpot-extras-ramyeon",
      recipeFoodProfile(
        ["wheat", "egg"],
        { vegan: "no", vegetarian: "unknown", glutenFree: "no" },
        false,
      ),
    ],
  ];
  for (const option of product.modifiers.flatMap((group) => group.options)) {
    const entry = additions.find(([suffix]) => option.id.endsWith(suffix));
    if (!entry) continue;
    const id = `tablecast-food-${entry[0].slice(1)}`;
    product.foodInfo.components.push({
      id,
      name: { ja: option.text.ja.displayName, en: option.text.en.displayName },
      profile: entry[1],
    });
    option.foodChanges = { add: [id], remove: [] };
  }
  if (product.id.endsWith("-edamame"))
    product.foodInfo.base = recipeFoodProfile(["soya"], { ...plant, halal: "yes" });
  if (product.tags.includes("alcohol"))
    product.foodInfo.base.dietary.halal = {
      status: "no",
      reasons: ["alcohol"],
    };
  return product;
}

export function koreanFoodInformation(product: Product): Product {
  if (!product.id.endsWith("-bibimbap")) return product;
  const base = recipeFoodProfile(["sesame", "soya", "wheat"], {
    vegan: "yes",
    vegetarian: "yes",
    glutenFree: "no",
  });
  const info: FoodInformation = {
    base,
    defaultComponentIds: ["beef", "egg"],
    components: [
      {
        id: "beef",
        name: { ja: "牛肉", en: "Beef" },
        profile: recipeFoodProfile(["beef"], { vegan: "no", vegetarian: "no", glutenFree: "yes" }),
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
    brioche: recipeFoodProfile(["wheat", "egg", "milk"], {
      vegan: "no",
      vegetarian: "yes",
      glutenFree: "no",
    }),
    wholemeal: recipeFoodProfile(["wheat"], { ...plant, glutenFree: "no" }),
    lettuce: recipeFoodProfile([], plant),
    beef: recipeFoodProfile(["beef"], { vegan: "no", vegetarian: "no", glutenFree: "yes" }),
    chicken: recipeFoodProfile(["chicken"], { vegan: "no", vegetarian: "no", glutenFree: "yes" }),
    patties: recipeFoodProfile(["soya"], plant),
    cheddar: cheese(),
    pepperJack: cheese(),
    house: recipeFoodProfile(["egg", "soya"], {
      vegan: "no",
      vegetarian: "yes",
      glutenFree: "yes",
    }),
    mustard: recipeFoodProfile([], plant),
    bbq: recipeFoodProfile(["wheat", "soya"], { ...plant, glutenFree: "no" }),
    avocado: recipeFoodProfile([], plant),
    bacon: recipeFoodProfile(["pork"], {
      vegan: "no",
      vegetarian: "no",
      halal: "no",
      glutenFree: "yes",
    }),
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
    base:
      isBurger || product.id.endsWith("-fries")
        ? recipeFoodProfile([], plant)
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
  if (product.id.endsWith("-fries")) {
    result.foodInfo.base.crossContact = "possible";
    result.foodInfo.base.crossContactSources = ["shared_frying_oil"];
  }
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
  if (product.tags.includes("alcohol")) {
    result.foodInfo.base.dietary.halal = {
      status: "no",
      reasons: ["alcohol"],
    };
    result.foodInfo.base.dietary.glutenFree = {
      status: "no",
      reasons: ["gluten_ingredients"],
    };
  }
  return result;
}
