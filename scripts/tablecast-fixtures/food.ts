import {
  dietaryKeys,
  type FoodInformation,
  type FoodProfile,
  type JapaneseAllergen,
  japaneseAllergenSchema,
  type Product,
  unknownFoodProfile,
} from "@tablecast/api/schema";

// 確認範囲を列挙した架空レシピだけに使う。実店舗の適合・認証を表さない。
function demoFoodProfile(
  contains: JapaneseAllergen[],
  states: Partial<Record<(typeof dietaryKeys)[number], "no" | "unknown" | "yes">> = {},
  recipe: readonly [string, string] = [
    "この具材の合成レシピ",
    "The synthetic recipe for this component",
  ],
  complete = true,
): FoodProfile {
  const profile = unknownFoodProfile();
  profile.basis = {
    ja: `架空デモの登録原材料・調理情報：${recipe[0]}。29品目を原材料として確認した合成設定値です。製造・調理・提供時の混入は未確認です。`,
    en: `Recorded ingredients and preparation for this fictional demo: ${recipe[1]}. The 29 ingredients were checked for this synthetic recipe. Cross-contact during production, preparation and service is unverified.`,
  };
  for (const id of japaneseAllergenSchema.options)
    if (complete || contains.includes(id))
      profile.allergens[id] = contains.includes(id) ? "contains" : "not_used";
  if (!complete)
    profile.basis = {
      ja: `架空デモの登録原材料：${recipe[0]}。未登録の原材料と交差接触は未確認です。`,
      en: `Recorded ingredients for this fictional demo: ${recipe[1]}. Unlisted ingredients and cross-contact are unverified.`,
    };
  for (const key of dietaryKeys)
    profile.dietary[key] = {
      status: states[key] ?? "unknown",
      basis: {
        ja: `架空レシピの確認：${recipe[0]}。${key === "halal" ? " ハラール認証なし。対応は架空の原材料・調理条件の登録に基づきます。" : ""}`,
        en: `Fictional recipe assessment: ${recipe[1]}.${key === "halal" ? " No halal certification. Suitability is a recorded fictional ingredient and preparation assessment." : ""}`,
      },
    };
  return profile;
}

const plant = { vegan: "yes", vegetarian: "yes", glutenFree: "yes" } as const;
const egg = () =>
  demoFoodProfile(["egg"], { vegan: "no", vegetarian: "yes", glutenFree: "yes" }, [
    "鶏卵",
    "Hen's egg",
  ]);
const cheese = () =>
  demoFoodProfile(["milk"], { vegan: "no", vegetarian: "yes", glutenFree: "yes" }, [
    "乳と微生物由来レンネットのチーズ",
    "Milk cheese made with microbial rennet",
  ]);

export function withDemoFoodChanges(input: Product): Product {
  const product = structuredClone(input);
  const additions: [string, FoodProfile][] = [
    ["-topping-egg", egg()],
    ["-hotpot-extras-cheese", cheese()],
    [
      "-seasoning-tare",
      demoFoodProfile(
        ["wheat", "soya"],
        { vegan: "unknown", vegetarian: "unknown", glutenFree: "no" },
        [
          "小麦・大豆を含むたれ。その他の詳細は未確認",
          "Soy glaze containing wheat and soya; other details are unverified",
        ],
        false,
      ),
    ],
    [
      "-hotpot-extras-ramyeon",
      demoFoodProfile(
        ["wheat", "egg"],
        { vegan: "no", vegetarian: "unknown", glutenFree: "no" },
        ["小麦と卵を含む麺。調味料は未確認", "Wheat and egg noodles; seasoning is unverified"],
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
    product.foodInfo.base = demoFoodProfile(["soya"], { ...plant, halal: "yes" }, [
      product.text.ja.description,
      product.text.en.description,
    ]);
  if (product.tags.includes("alcohol"))
    product.foodInfo.base.dietary.halal = {
      status: "no",
      basis: {
        ja: "架空デモの登録レシピに飲用アルコールを含みます。",
        en: "The registered fictional recipe contains alcoholic drink.",
      },
    };
  return product;
}

export function koreanFoodInformation(product: Product): Product {
  if (!product.id.endsWith("-bibimbap")) return product;
  const base = demoFoodProfile(
    ["sesame", "soya", "wheat"],
    { vegan: "yes", vegetarian: "yes", glutenFree: "no" },
    [
      "米・ごま油・野菜・小麦と大豆を含むコチュジャン。肉・卵は別の具材",
      "Rice, sesame oil, vegetables and gochujang containing wheat and soya; meat and egg are separate components",
    ],
  );
  const info: FoodInformation = {
    base,
    defaultComponentIds: ["beef", "egg"],
    components: [
      {
        id: "beef",
        name: { ja: "牛肉", en: "Beef" },
        profile: demoFoodProfile(["beef"], { vegan: "no", vegetarian: "no", glutenFree: "yes" }, [
          "牛肉",
          "Beef",
        ]),
      },
      {
        id: "tofu",
        name: { ja: "豆腐", en: "Tofu" },
        profile: demoFoodProfile(["soya"], plant, [
          "大豆と凝固剤の豆腐",
          "Tofu made with soya and coagulant",
        ]),
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
    brioche: demoFoodProfile(
      ["wheat", "egg", "milk"],
      { vegan: "no", vegetarian: "yes", glutenFree: "no" },
      ["小麦・卵・乳のブリオッシュ", "Wheat, egg and milk brioche"],
    ),
    wholemeal: demoFoodProfile(["wheat"], { ...plant, glutenFree: "no" }, [
      "小麦・水・酵母・塩の全粒粉バンズ",
      "Wholemeal bun made with wheat, water, yeast and salt",
    ]),
    lettuce: demoFoodProfile([], plant, ["レタス", "Lettuce"]),
    beef: demoFoodProfile(["beef"], { vegan: "no", vegetarian: "no", glutenFree: "yes" }, [
      "十分に加熱した牛肉",
      "Fully cooked beef",
    ]),
    chicken: demoFoodProfile(["chicken"], { vegan: "no", vegetarian: "no", glutenFree: "yes" }, [
      "十分に加熱した鶏肉",
      "Fully cooked chicken",
    ]),
    patties: demoFoodProfile(["soya"], plant, [
      "大豆・きのこ・塩の植物由来パティ",
      "Plant-based patty made with soya, mushrooms and salt",
    ]),
    cheddar: cheese(),
    pepperJack: cheese(),
    house: demoFoodProfile(["egg", "soya"], { vegan: "no", vegetarian: "yes", glutenFree: "yes" }, [
      "卵・大豆油・酢・マスタードのソース",
      "Egg, soya oil, vinegar and mustard sauce",
    ]),
    mustard: demoFoodProfile([], plant, [
      "からし種・酢・塩のマスタード",
      "Mustard made with mustard seeds, vinegar and salt",
    ]),
    bbq: demoFoodProfile(["wheat", "soya"], { ...plant, glutenFree: "no" }, [
      "トマト・しょうゆ・砂糖のBBQソース",
      "Tomato, soy sauce and sugar BBQ sauce",
    ]),
    avocado: demoFoodProfile([], plant, ["アボカド", "Avocado"]),
    bacon: demoFoodProfile(
      ["pork"],
      { vegan: "no", vegetarian: "no", halal: "no", glutenFree: "yes" },
      ["豚肉・塩のベーコン", "Pork and salt bacon"],
    ),
    onion: demoFoodProfile([], plant, ["玉ねぎ", "Onion"]),
    tomato: demoFoodProfile([], plant, ["トマト", "Tomato"]),
    pickle: demoFoodProfile([], plant, [
      "きゅうり・酢・塩のピクルス",
      "Cucumber, vinegar and salt pickles",
    ]),
  };
  definitions.house.otherAllergens = ["mustard"];
  definitions.mustard.otherAllergens = ["mustard"];
  const components: FoodInformation["components"] = Object.entries(definitions).map(
    ([id, profile]) => ({
      id,
      name: {
        ja: profile.basis.ja.split("：")[1]?.split("。")[0] ?? id,
        en: profile.basis.en.split(": ")[1]?.split(". ")[0] ?? id,
      },
      profile,
    }),
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
        ? demoFoodProfile([], plant, [
            "固定の塩・こしょう・調理条件",
            "Fixed salt, pepper and preparation conditions",
          ])
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
  if (product.id.endsWith("-fries")) result.foodInfo.base.crossContact = "possible";
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
      basis: {
        ja: "架空のビールの登録レシピにアルコールを含みます。",
        en: "The fictional beer recipe contains alcohol.",
      },
    };
    result.foodInfo.base.dietary.glutenFree = {
      status: "no",
      basis: {
        ja: "架空のビールは大麦麦芽を使い、グルテン除去はしていません。",
        en: "The fictional beer uses barley malt without gluten removal.",
      },
    };
  }
  return result;
}
