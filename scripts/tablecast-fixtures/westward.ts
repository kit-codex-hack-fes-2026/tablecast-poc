import type { JapaneseAllergen, Modifier, Product } from "@tablecast/api/schema";
import { configurationSchema } from "@tablecast/api/schema";
import { demoImageKey } from "../tablecast-seed-media.ts";
import {
  recipeFoodInformation,
  seedDietary,
  type SeedDietary,
  westwardFoodInformation,
} from "./food.ts";
import { bilingual } from "./text.ts";
import { westwardModifiers } from "./westward-modifiers.ts";

export function westwardConfiguration(storeId: string, profile: "demo" | "history" | "smoke") {
  const { bun, patty, cheese, omit, sauce, extras, serving } = westwardModifiers(storeId);
  const menu: {
    available?: boolean;
    category: string;
    contains: JapaneseAllergen[];
    dietary: SeedDietary;
    en: string;
    image?: string;
    ingredients: readonly [string, string];
    ja: string;
    key: string;
    modifiers?: Modifier[];
    price: number;
  }[] = [
    {
      key: "westward-classic",
      ja: "ウエストワード・カスタムバーガー",
      en: "Westward custom burger",
      price: 1380,
      category: "burgers",
      ingredients: [
        "ブリオッシュ、ビーフ、チェダー、レタス、トマト、玉ねぎ、ピクルス、卵入りソース。パティは十分に加熱します",
        "Brioche, fully cooked beef, cheddar, lettuce, tomato, onion, pickles and an egg-based sauce",
      ],
      contains: ["wheat", "egg", "milk"],
      dietary: seedDietary.meatGluten,
      modifiers: [bun, patty, cheese, omit, sauce, extras],
      image: "westward-burger.png",
    },
    {
      key: "chicken-burger",
      ja: "グリルチキンバーガー",
      en: "Grilled chicken burger",
      price: 1280,
      category: "burgers",
      ingredients: [
        "ブリオッシュ、十分に加熱した鶏肉、チェダー、野菜、卵入りソース",
        "Brioche, fully cooked chicken, cheddar, vegetables and an egg-based sauce",
      ],
      contains: ["wheat", "egg", "milk"],
      dietary: seedDietary.meatGluten,
      modifiers: [bun, cheese, omit, sauce, extras],
    },
    {
      key: "mushroom-burger",
      ja: "きのこと植物由来パティのバーガー",
      en: "Mushroom and plant-based patty burger",
      price: 1480,
      category: "burgers",
      ingredients: [
        "大豆ときのこのパティ、きのこ、ブリオッシュ、チェダー、野菜、卵と大豆入りソース",
        "Soya and mushroom patty, mushrooms, brioche, cheddar, vegetables and an egg-and-soya sauce",
      ],
      contains: ["wheat", "egg", "milk", "soya"],
      dietary: seedDietary.eggMilkGluten,
      modifiers: [bun, cheese, omit, sauce, extras],
    },
    {
      key: "fries",
      ja: "シーソルトフライ",
      en: "Sea-salt fries",
      price: 580,
      category: "sides",
      ingredients: [
        "じゃがいもと塩。揚げ油は他の商品と共用します",
        "Potatoes and salt; frying oil is shared with other dishes",
      ],
      contains: [],
      dietary: seedDietary.plant,
      modifiers: [extras],
    },
    {
      key: "onion-rings",
      ja: "オニオンリング",
      en: "Onion rings",
      price: 680,
      category: "sides",
      ingredients: ["玉ねぎ、小麦粉と卵の衣", "Onion in a wheat-flour and egg batter"],
      contains: ["wheat", "egg"],
      dietary: seedDietary.eggMilkGluten,
    },
    {
      key: "slaw",
      ja: "ハウスコールスロー",
      en: "House coleslaw",
      price: 420,
      category: "sides",
      ingredients: ["キャベツ、にんじん、卵入りマヨネーズ", "Cabbage, carrot and egg mayonnaise"],
      contains: ["egg"],
      dietary: seedDietary.eggMilk,
    },
    {
      key: "pickles",
      ja: "ハウスピクルス",
      en: "House pickles",
      price: 380,
      category: "sides",
      ingredients: [
        "きゅうり、にんじん、玉ねぎを米酢、塩、砂糖で漬けます",
        "Cucumber, carrot and onion pickled in rice vinegar, salt and sugar",
      ],
      contains: [],
      dietary: seedDietary.plant,
    },
    {
      key: "westward-ipa",
      ja: "パシフィック・ウエストコーストIPA",
      en: "Pacific West Coast IPA",
      price: 880,
      category: "craft-beer",
      ingredients: [
        "麦芽とホップ、柑橘を思わせる香りと明瞭な苦味。アルコール6.5%。基本容量280ml",
        "beer brewed with malt and hops, citrus-like aromas and a firm bitterness; 6.5% ABV, base serving 280ml",
      ],
      contains: [],
      dietary: seedDietary.maltAlcohol,
      modifiers: [serving],
      image: "westward-ipa.png",
    },
    {
      key: "sunset-pale",
      ja: "サンセット・ペールエール",
      en: "Sunset pale ale",
      price: 820,
      category: "craft-beer",
      ingredients: [
        "麦芽とホップ、穏やかな苦味。アルコール5.0%。基本容量280ml",
        "beer brewed with malt and hops, with a gentle bitterness; 5.0% ABV, base serving 280ml",
      ],
      contains: [],
      dietary: seedDietary.maltAlcohol,
      modifiers: [serving],
    },
    {
      key: "nightfall-stout",
      ja: "ナイトフォール・スタウト",
      en: "Nightfall stout",
      price: 920,
      category: "craft-beer",
      ingredients: [
        "焙煎麦芽の香り。アルコール6.0%。基本容量280ml。本日は売切です",
        "beer with roasted-malt aromas; 6.0% ABV, base serving 280ml. Sold out today",
      ],
      contains: [],
      dietary: seedDietary.maltAlcohol,
      modifiers: [serving],
      available: false,
    },
    {
      key: "yuzu-soda",
      ja: "ゆずソーダ",
      en: "Yuzu citrus soda",
      price: 480,
      category: "soft-drinks",
      ingredients: ["ゆず果汁と炭酸水", "Yuzu juice and sparkling water"],
      contains: [],
      dietary: seedDietary.plant,
      image: "yuzu-soda.png",
    },
    {
      key: "oolong",
      ja: "烏龍茶",
      en: "Oolong tea",
      price: 420,
      category: "soft-drinks",
      ingredients: ["冷たい烏龍茶", "Chilled oolong tea"],
      contains: [],
      dietary: seedDietary.plant,
      image: "oolong.png",
    },
  ];
  const products: Product[] = menu
    .filter(
      (item) =>
        profile !== "smoke" ||
        ["westward-classic", "fries", "westward-ipa", "yuzu-soda"].includes(item.key),
    )
    .map((item) => {
      const text = bilingual(item.ja, item.en, item.ingredients[0], item.ingredients[1]);
      text.ja.aliases = [
        item.ja,
        ...(item.key === "westward-classic" ? ["ハンバーガー", "カスタムバーガー"] : []),
      ];
      text.en.aliases = [item.en.toLowerCase()];
      return westwardFoodInformation({
        id: `${storeId}-${item.key}`,
        categoryId: item.category,
        text,
        price: item.price,
        available: item.available ?? true,
        tags: item.category === "craft-beer" ? ["alcohol"] : [],
        imageKey: demoImageKey(`westward-${item.key}.webp`),
        imageKind: "illustration",
        modifiers: item.modifiers ?? [],
        foodInfo: recipeFoodInformation(
          item.contains,
          item.dietary,
          ["fries", "onion-rings"].includes(item.key) ? "fried" : item.category,
        ),
      });
    });
  return configurationSchema.parse({
    categories: (
      [
        ["burgers", "バーガー", "Burgers"],
        ["sides", "サイド", "Sides"],
        ["craft-beer", "クラフトビール", "Craft beer"],
        ["soft-drinks", "ソフトドリンク", "Soft drinks"],
      ] as const
    ).map(([id, ja, en]) => ({ id, text: bilingual(ja, en) })),
    products,
    plans: [
      {
        id: `${storeId}-drinks`,
        text: bilingual(
          "クラフトビールとソフトドリンク 飲み放題",
          "Craft beer and soft drinks selection",
          "90分、基本容量の対象飲料を一人4杯まで。大容量は対象外です。",
          "Ninety minutes, up to four base-size drinks per person. Larger servings are excluded.",
        ),
        pricePerPerson: 2800,
        durationMinutes: 90,
        lastOrderMinutesBeforeEnd: 20,
        productIds: [],
        categoryIds: ["craft-beer", "soft-drinks"],
        tags: [],
        maxPerOrder: 4,
        maxTotalPerPerson: 4,
        intervalSeconds: 60,
        excludedOptionIds: [`${storeId}-beer-serving-pint`],
        includedOptionSurcharge: false,
      },
    ],
    cast: {
      instructions: {
        ja: "西海岸のタップルームのように親しみやすく案内します。バーガーの必須選択を一つずつ確認し、同じ卓の別の注文は別行に保ち、誰の訂正か曖昧なら確認します。ビールの苦味の好みを聞き、飲まない客にはソフトドリンクを案内します。合計と有料追加を明示し、明示承認後に注文します。宗教や食習慣、植物由来パティだけを根拠に適合を断言せず、不明な原材料や交差接触はスタッフへ引き継ぎます。",
        en: "Offer a friendly West Coast taproom welcome. Ask for required burger choices one at a time. Keep different burgers on separate lines in the shared table order and clarify ambiguous corrections. Ask about preferred bitterness and offer soft drinks to guests who do not drink alcohol. State extras and totals before explicit order approval. Do not infer dietary or religious suitability from identity or a plant-based patty; refer unverified ingredients and cross-contact to staff.",
      },
      voice: { ja: null, en: null },
      proactive: false,
    },
  });
}
