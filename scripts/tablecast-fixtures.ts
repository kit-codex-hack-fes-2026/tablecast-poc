import { configurationSchema } from "../apps/api/src/schema";
import type { Configuration, Modifier, Product } from "../apps/api/src/schema";

export function bilingual(
  ja: string,
  en: string,
  descriptionJa = "",
  descriptionEn = "",
): Product["text"] {
  return {
    ja: { displayName: ja, speechName: ja, description: descriptionJa, aliases: [] },
    en: { displayName: en, speechName: en, description: descriptionEn, aliases: [] },
  };
}

const stores = [
  {
    id: "tablecast-komorebi",
    name: "こもれび · Komorebi",
    label: "こもれび",
    english: "Komorebi",
  },
  {
    id: "tablecast-akari",
    name: "あかり · Akari",
    label: "あかり",
    english: "Akari",
  },
  {
    id: "tablecast-koharu",
    name: "こはる · Koharu",
    label: "こはる",
    english: "Koharu",
  },
];
const categories = [
  ["sake", "日本酒", "Sake"],
  ["sashimi", "刺身", "Sashimi"],
  ["fried", "揚げもの", "Fried dishes"],
  ["grilled", "焼きもの", "Grilled dishes"],
  ["small-plates", "酒の肴", "Small plates"],
  ["rice", "ご飯と〆", "Rice & noodles"],
  ["drinks", "そのほかのお飲み物", "Other drinks"],
] as const;

type SakeKind = "junmai" | "ginjo" | "daiginjo" | "honjozo" | "nigori" | "sparkling" | "aged";
const sakeKinds: Record<SakeKind, readonly [string, string]> = {
  junmai: ["純米酒", "Junmai"],
  ginjo: ["純米吟醸", "Junmai ginjo"],
  daiginjo: ["純米大吟醸", "Junmai daiginjo"],
  honjozo: ["本醸造", "Honjozo"],
  nigori: ["にごり酒", "Nigori"],
  sparkling: ["発泡清酒", "Sparkling sake"],
  aged: ["熟成酒", "Aged sake"],
};
type Sake = readonly [string, string, string, string, SakeKind, string, string, number];
const sakes: Sake[] = [
  [
    "tsukinagi",
    "月凪",
    "つきなぎ",
    "Tsukinagi",
    "ginjo",
    "青りんごを思わせる香りと軽い後口",
    "green-apple aromas and a light finish",
    620,
  ],
  [
    "yukiakari",
    "雪灯",
    "ゆきあかり",
    "Yukiakari",
    "junmai",
    "米のうま味とすっきりした辛口",
    "rice-rich umami and a clean, dry finish",
    540,
  ],
  [
    "yamagiri",
    "山霞",
    "やまぎり",
    "Yamagiri",
    "daiginjo",
    "白い花のような香りと繊細な口当たり",
    "white-flower aromas and a delicate texture",
    850,
  ],
  [
    "namiho",
    "波穂",
    "なみほ",
    "Namiho",
    "honjozo",
    "きりっとした飲み口と穏やかな香り",
    "a crisp palate and gentle aromas",
    480,
  ],
  [
    "yoishizuku",
    "宵雫",
    "よいしずく",
    "Yoishizuku",
    "ginjo",
    "洋梨を思わせる香りとやわらかな甘み",
    "pear-like aromas and a soft sweetness",
    680,
  ],
  [
    "kazenone",
    "風乃音",
    "かぜのね",
    "Kazenone",
    "junmai",
    "香ばしい米の香りと丸みのある味わい",
    "toasted-rice aromas and a rounded palate",
    580,
  ],
  [
    "harumio",
    "春澪",
    "はるみお",
    "Harumio",
    "nigori",
    "なめらかな米の甘みとやさしい酸味",
    "creamy rice sweetness and gentle acidity",
    640,
  ],
  [
    "hoshifune",
    "星舟",
    "ほしふね",
    "Hoshifune",
    "sparkling",
    "細かな泡と柑橘を思わせる爽やかさ",
    "fine bubbles and a citrus-like freshness",
    720,
  ],
  [
    "akikage",
    "秋景",
    "あきかげ",
    "Akikage",
    "aged",
    "琥珀色と木の実を思わせる深い香り",
    "an amber colour and deep, nutty aromas",
    780,
  ],
  [
    "asatsuyu",
    "朝露路",
    "あさつゆじ",
    "Asatsuyuji",
    "ginjo",
    "みずみずしい香りと軽快な酸味",
    "fresh aromas and lively acidity",
    650,
  ],
  [
    "komehotaru",
    "米蛍",
    "こめほたる",
    "Komehotaru",
    "junmai",
    "ふくらみのある米の甘みと長い余韻",
    "full rice sweetness and a lingering finish",
    590,
  ],
  [
    "sazanami",
    "笹波月",
    "ささなみづき",
    "Sasanamizuki",
    "honjozo",
    "軽快な辛口とほのかな穀物の香り",
    "a light, dry palate with a hint of grain",
    510,
  ],
  [
    "shirohana",
    "白花里",
    "しろはなり",
    "Shirohanari",
    "daiginjo",
    "メロンを思わせる香りと澄んだ後口",
    "melon-like aromas and a clear finish",
    920,
  ],
  [
    "midorisawa",
    "緑沢音",
    "みどりさわね",
    "Midorisawane",
    "junmai",
    "青草を思わせる香りと引き締まった酸味",
    "fresh herbal aromas and firm acidity",
    600,
  ],
  [
    "yuunagi",
    "夕凪穂",
    "ゆうなぎほ",
    "Yunagiho",
    "ginjo",
    "桃を思わせる香りとまろやかな余韻",
    "peach-like aromas and a mellow finish",
    700,
  ],
  [
    "fuyukumo",
    "冬雲白",
    "ふゆくもしろ",
    "Fuyukumoshiro",
    "nigori",
    "濃厚な米の風味と控えめな甘さ",
    "rich rice flavours with restrained sweetness",
    690,
  ],
  [
    "aoitsuki",
    "蒼月路",
    "あおつきじ",
    "Aotsukiji",
    "sparkling",
    "爽やかな泡ときれのよい辛口",
    "refreshing bubbles and a brisk, dry finish",
    760,
  ],
  [
    "tamakura",
    "珠蔵夜",
    "たまくらよ",
    "Tamakurayo",
    "aged",
    "蜂蜜を思わせる香りと厚みのある味",
    "honey-like aromas and a deep palate",
    840,
  ],
  [
    "inahonami",
    "稲穂波",
    "いなほなみ",
    "Inahonami",
    "junmai",
    "炊いた米の香りと穏やかなうま味",
    "steamed-rice aromas and gentle umami",
    560,
  ],
  [
    "tsurusato",
    "鶴里風",
    "つるさとかぜ",
    "Tsurusatokaze",
    "honjozo",
    "すっきりした辛さと短く軽い余韻",
    "a clean dryness and a short, light finish",
    500,
  ],
  [
    "mizukagami",
    "水鏡穂",
    "みずかがみほ",
    "Mizukagamiho",
    "ginjo",
    "りんごの蜜を思わせる香りと端正な酸味",
    "apple aromas balanced by precise acidity",
    730,
  ],
  [
    "kinuhikari",
    "絹光夜",
    "きぬひかりよ",
    "Kinuhikariyo",
    "daiginjo",
    "絹のような口当たりと華やかな香り",
    "a silky texture and expressive floral aromas",
    980,
  ],
  [
    "satonooto",
    "里乃響",
    "さとのひびき",
    "Satonohibiki",
    "junmai",
    "きのこを思わせるうま味と落ち着いた香り",
    "savoury, mushroom-like umami and quiet aromas",
    610,
  ],
  [
    "akatsukiro",
    "暁路",
    "あかつきろ",
    "Akatsukiro",
    "ginjo",
    "柑橘の皮を思わせる香りと爽やかな苦み",
    "citrus-peel aromas and a refreshing bitter note",
    670,
  ],
  [
    "yukimatoi",
    "雪纏穂",
    "ゆきまといほ",
    "Yukimatoiho",
    "nigori",
    "やさしい甘みととろりとした口当たり",
    "gentle sweetness and a soft, creamy texture",
    660,
  ],
  [
    "momijikura",
    "紅葉蔵音",
    "もみじくらね",
    "Momijikurane",
    "aged",
    "カラメルを思わせる香りと豊かな余韻",
    "caramel-like aromas and a rich finish",
    890,
  ],
  [
    "sorashizuku",
    "空雫里",
    "そらしずくり",
    "Sorashizukuri",
    "daiginjo",
    "白ぶどうを思わせる香りと透明感",
    "white-grape aromas and a clean character",
    940,
  ],
  [
    "nagorihoshi",
    "名残星",
    "なごりぼし",
    "Nagoriboshi",
    "junmai",
    "旨みを残した辛口と温めた米の香り",
    "a savoury dry finish and warm-rice aromas",
    630,
  ],
];

type GroupKey =
  | "temperature"
  | "serving"
  | "seasoning"
  | "spice"
  | "garnish"
  | "topping"
  | "broth"
  | "ice";
type Group = {
  key: GroupKey;
  ja: string;
  en: string;
  kind: Modifier["kind"];
  min: number;
  max: number;
  choices: readonly (readonly [string, string, string, number])[];
};
const groupDefinitions: Group[] = [
  {
    key: "temperature",
    ja: "日本酒の温度",
    en: "Sake temperature",
    kind: "single",
    min: 1,
    max: 1,
    choices: [
      ["chilled", "冷酒", "Chilled", 0],
      ["room", "常温", "Room temperature", 0],
      ["warm", "ぬる燗", "Gently warmed", 0],
      ["hot", "熱燗", "Hot sake", 0],
    ],
  },
  {
    key: "serving",
    ja: "日本酒の容量",
    en: "Sake serving",
    kind: "single",
    min: 1,
    max: 1,
    choices: [
      ["taster", "お試し 六十ミリリットル", "Taster, sixty millilitres", 0],
      ["glass", "グラス 九十ミリリットル", "Glass, ninety millilitres", 160],
      ["tokkuri", "一合 百八十ミリリットル", "Tokkuri, one hundred and eighty millilitres", 520],
      ["carafe", "小瓶 三百ミリリットル", "Carafe, three hundred millilitres", 980],
    ],
  },
  {
    key: "seasoning",
    ja: "味付け",
    en: "Seasoning",
    kind: "single",
    min: 1,
    max: 1,
    choices: [
      ["salt", "塩", "Salt", 0],
      ["tare", "たれ", "Sweet soy glaze", 0],
      ["ponzu", "ポン酢", "Citrus ponzu", 0],
      ["plain", "味付けなし", "Unseasoned", 0],
    ],
  },
  {
    key: "spice",
    ja: "辛さ",
    en: "Spice level",
    kind: "single",
    min: 0,
    max: 1,
    choices: [
      ["none", "辛味なし", "No chilli", 0],
      ["light", "控えめ", "Mild", 0],
      ["medium", "中辛", "Medium", 0],
      ["hot", "辛口", "Hot", 40],
    ],
  },
  {
    key: "garnish",
    ja: "薬味の別添え",
    en: "Garnishes on the side",
    kind: "multiple",
    min: 0,
    max: 3,
    choices: [
      ["ginger", "しょうが", "Ginger", 0],
      ["wasabi", "わさび", "Wasabi", 0],
      ["shiso", "大葉", "Shiso leaf", 30],
      ["lemon", "レモン", "Lemon", 30],
    ],
  },
  {
    key: "topping",
    ja: "追加トッピング",
    en: "Extra toppings",
    kind: "quantity",
    min: 0,
    max: 6,
    choices: [
      ["scallion", "ねぎ", "Spring onion", 50],
      ["radish", "大根おろし", "Grated daikon", 70],
      ["nori", "刻みのり", "Shredded nori", 50],
      ["egg", "温泉卵", "Soft-cooked egg", 120],
    ],
  },
  {
    key: "broth",
    ja: "出汁",
    en: "Broth",
    kind: "single",
    min: 1,
    max: 1,
    choices: [
      ["bonito", "かつお出汁", "Bonito broth", 0],
      ["kombu", "昆布出汁", "Kombu broth", 0],
      ["chicken", "鶏出汁", "Chicken broth", 60],
      ["miso", "味噌出汁", "Miso broth", 40],
    ],
  },
  {
    key: "ice",
    ja: "お飲み物の温度と氷",
    en: "Drink temperature & ice",
    kind: "single",
    min: 1,
    max: 1,
    choices: [
      ["iced", "氷あり", "With ice", 0],
      ["less", "氷少なめ", "Less ice", 0],
      ["none", "氷なし", "Without ice", 0],
      ["hot", "温かいお茶", "Hot tea", 0],
    ],
  },
];

type Food = {
  id: string;
  ja: string;
  en: string;
  price: number;
  category: string;
  image: string;
  groups: GroupKey[];
  ingredients: readonly [string, string];
  contains: string[] | null;
  speech?: string;
};
const foods: Food[] = [
  {
    id: "sashimi",
    ja: "お造り三種盛り",
    en: "Three-fish sashimi selection",
    price: 1280,
    category: "sashimi",
    image: "sashimi",
    groups: ["garnish"],
    ingredients: [
      "まぐろ・さけ・たいを各三切れ盛り合わせます",
      "Three slices each of tuna, salmon and sea bream, served raw",
    ],
    contains: ["fish"],
    speech: "おつくり三種盛り",
  },
  {
    id: "karaage",
    ja: "鶏の唐揚げ",
    en: "Japanese fried chicken",
    price: 720,
    category: "fried",
    image: "karaage",
    groups: ["seasoning", "spice"],
    ingredients: [
      "鶏もも肉を小麦粉としょうゆの衣で揚げた五個盛りです",
      "Five pieces of chicken thigh fried in a wheat-flour and soy coating",
    ],
    contains: ["wheat", "soya"],
  },
  {
    id: "salmon-sashimi",
    ja: "さけのお造り",
    en: "Salmon sashimi",
    price: 890,
    category: "sashimi",
    image: "salmon-sashimi",
    groups: ["garnish"],
    ingredients: ["さけを生で提供します", "Salmon, served raw"],
    contains: ["fish"],
  },
  {
    id: "tuna-sashimi",
    ja: "まぐろのお造り",
    en: "Tuna sashimi",
    price: 980,
    category: "sashimi",
    image: "tuna-sashimi",
    groups: ["garnish"],
    ingredients: ["まぐろの赤身を生で提供します", "Lean tuna, served raw"],
    contains: ["fish"],
  },
  {
    id: "yakitori",
    ja: "鶏もも串 三本",
    en: "Three chicken thigh skewers",
    price: 840,
    category: "grilled",
    image: "yakitori",
    groups: ["seasoning", "spice"],
    ingredients: [
      "鶏もも肉とねぎを焼きます。たれには小麦と大豆を含みます",
      "Grilled chicken thigh and spring onion; the glaze contains wheat and soya",
    ],
    contains: ["wheat", "soya"],
  },
  {
    id: "tsukune",
    ja: "つくね串 二本",
    en: "Two chicken meatball skewers",
    price: 620,
    category: "grilled",
    image: "tsukune",
    groups: ["seasoning", "spice"],
    ingredients: [
      "鶏ひき肉、卵、小麦粉を合わせて焼きます",
      "Grilled chicken meatballs made with egg and wheat flour",
    ],
    contains: ["egg", "wheat", "soya"],
  },
  {
    id: "tamagoyaki",
    ja: "出汁巻き卵",
    en: "Japanese rolled omelette with dashi",
    price: 650,
    category: "small-plates",
    image: "tamagoyaki",
    groups: ["topping"],
    ingredients: [
      "卵とかつお出汁を使い、四切れで提供します",
      "Rolled eggs with bonito broth, served in four pieces",
    ],
    contains: ["egg", "fish"],
    speech: "だし巻きたまご",
  },
  {
    id: "edamame",
    ja: "枝豆",
    en: "Edamame beans",
    price: 390,
    category: "small-plates",
    image: "edamame",
    groups: [],
    ingredients: ["大豆を塩ゆでします", "Soya beans boiled in salted water"],
    contains: ["soya"],
  },
  {
    id: "tofu",
    ja: "冷ややっこ",
    en: "Chilled tofu",
    price: 440,
    category: "small-plates",
    image: "tofu",
    groups: ["garnish"],
    ingredients: ["大豆の豆腐に薬味を添えます", "Chilled soya tofu with garnishes"],
    contains: ["soya"],
  },
  {
    id: "pickles",
    ja: "季節のお漬物",
    en: "Seasonal Japanese pickles",
    price: 450,
    category: "small-plates",
    image: "pickles",
    groups: [],
    ingredients: [
      "季節によって野菜と漬け床が変わります。詳しい原材料は未登録です",
      "Vegetables and pickling ingredients vary; full ingredients are not recorded",
    ],
    contains: null,
  },
  {
    id: "potato-salad",
    ja: "居酒屋のポテトサラダ",
    en: "Izakaya potato salad",
    price: 520,
    category: "small-plates",
    image: "potato-salad",
    groups: ["spice"],
    ingredients: [
      "じゃがいも、きゅうり、卵入りマヨネーズを使います",
      "Potato and cucumber with egg mayonnaise",
    ],
    contains: ["egg"],
  },
  {
    id: "cucumber",
    ja: "たたききゅうり",
    en: "Smashed cucumber with sesame",
    price: 420,
    category: "small-plates",
    image: "cucumber",
    groups: ["spice"],
    ingredients: [
      "きゅうりをごま油としょうゆで和えます",
      "Cucumber dressed with sesame oil and soy sauce",
    ],
    contains: ["sesame", "wheat", "soya"],
  },
  {
    id: "mackerel",
    ja: "さばの塩焼き",
    en: "Salt-grilled mackerel",
    price: 820,
    category: "grilled",
    image: "mackerel",
    groups: ["garnish"],
    ingredients: ["さばを塩焼きにします", "Mackerel grilled with salt"],
    contains: ["fish"],
  },
  {
    id: "hokke",
    ja: "ほっけの開き",
    en: "Grilled split Atka mackerel",
    price: 980,
    category: "grilled",
    image: "hokke",
    groups: ["garnish"],
    ingredients: ["ほっけの干物を焼きます", "Dried Atka mackerel, grilled"],
    contains: ["fish"],
  },
  {
    id: "aubergine",
    ja: "なすの田楽",
    en: "Miso-glazed aubergine",
    price: 580,
    category: "grilled",
    image: "aubergine",
    groups: ["spice"],
    ingredients: [
      "なすに大豆の味噌だれを塗って焼きます",
      "Aubergine grilled with a soya-miso glaze",
    ],
    contains: ["soya"],
  },
  {
    id: "shiitake",
    ja: "しいたけの炭火焼き",
    en: "Charcoal-grilled shiitake mushrooms",
    price: 560,
    category: "grilled",
    image: "shiitake",
    groups: ["seasoning"],
    ingredients: [
      "しいたけを炭火で焼きます。たれには小麦と大豆を含みます",
      "Charcoal-grilled shiitake; the glaze contains wheat and soya",
    ],
    contains: ["wheat", "soya"],
  },
  {
    id: "mixed-tempura",
    ja: "海老と野菜の天ぷら盛合せ",
    en: "Prawn and vegetable tempura selection",
    price: 1180,
    category: "fried",
    image: "tempura",
    groups: [],
    ingredients: [
      "海老二尾となす・かぼちゃ・ししとうを小麦粉と卵の衣で揚げます",
      "Two prawns, aubergine, pumpkin and shishito peppers fried in a wheat-flour and egg batter",
    ],
    contains: ["prawn", "wheat", "egg"],
  },
  {
    id: "prawn-tempura",
    ja: "海老の天ぷら",
    en: "Prawn tempura",
    price: 920,
    category: "fried",
    image: "prawn-tempura",
    groups: [],
    ingredients: ["海老を小麦粉と卵の衣で揚げます", "Prawns fried in a wheat-flour and egg batter"],
    contains: ["prawn", "wheat", "egg"],
    speech: "えびの天ぷら",
  },
  {
    id: "agedashi-tofu",
    ja: "揚げ出し豆腐",
    en: "Fried tofu in dashi broth",
    price: 610,
    category: "fried",
    image: "agedashi-tofu",
    groups: ["topping"],
    ingredients: [
      "豆腐を揚げ、かつお出汁としょうゆを合わせます",
      "Fried soya tofu in bonito broth with soy sauce",
    ],
    contains: ["soya", "wheat", "fish"],
  },
  {
    id: "nikujaga",
    ja: "肉じゃが",
    en: "Japanese beef and potato stew",
    price: 690,
    category: "small-plates",
    image: "nikujaga",
    groups: [],
    ingredients: [
      "牛肉、じゃがいも、玉ねぎをしょうゆで煮ます",
      "Beef, potatoes and onion simmered in soy sauce",
    ],
    contains: ["wheat", "soya"],
  },
  {
    id: "kakuni",
    ja: "豚の角煮",
    en: "Slow-braised pork belly",
    price: 880,
    category: "small-plates",
    image: "kakuni",
    groups: ["garnish"],
    ingredients: [
      "豚ばら肉をしょうゆ、砂糖、しょうがで煮ます",
      "Pork belly braised with soy sauce, sugar and ginger",
    ],
    contains: ["wheat", "soya"],
  },
  {
    id: "onigiri",
    ja: "焼きおにぎり 二個",
    en: "Two grilled rice balls",
    price: 460,
    category: "rice",
    image: "onigiri",
    groups: [],
    ingredients: ["ご飯にしょうゆを塗って焼きます", "Rice balls grilled with soy sauce"],
    contains: ["wheat", "soya"],
  },
  {
    id: "ochazuke",
    ja: "さけの出汁茶漬け",
    en: "Salmon rice with dashi broth",
    price: 680,
    category: "rice",
    image: "ochazuke",
    groups: ["broth", "topping"],
    ingredients: [
      "ご飯、焼きざけ、選んだ出汁を合わせます",
      "Rice and grilled salmon with your chosen broth",
    ],
    contains: ["fish"],
  },
  {
    id: "udon",
    ja: "〆のかけうどん",
    en: "Udon noodles in broth",
    price: 590,
    category: "rice",
    image: "udon",
    groups: ["broth", "topping"],
    ingredients: [
      "小麦のうどんと選んだ出汁を合わせます",
      "Wheat udon noodles in your chosen broth",
    ],
    contains: ["wheat"],
    speech: "しめのかけうどん",
  },
];
const drinks: Food[] = [
  {
    id: "beer",
    ja: "生ビール",
    en: "Draught beer",
    price: 590,
    category: "drinks",
    image: "beer",
    groups: [],
    ingredients: ["麦芽を使用したビールです", "Beer brewed with malted barley"],
    contains: ["barley"],
  },
  {
    id: "highball",
    ja: "ハイボール",
    en: "Whisky highball",
    price: 520,
    category: "drinks",
    image: "highball",
    groups: [],
    ingredients: ["ウイスキーと炭酸水を合わせます", "Whisky topped with sparkling water"],
    contains: [],
  },
  {
    id: "lemon-sour",
    ja: "レモンサワー",
    en: "Lemon sour",
    price: 490,
    category: "drinks",
    image: "lemon-sour",
    groups: [],
    ingredients: ["焼酎、レモン、炭酸水を合わせます", "Shochu, lemon and sparkling water"],
    contains: [],
  },
  {
    id: "plum-wine",
    ja: "梅酒のロック",
    en: "Umeshu plum liqueur on ice",
    price: 560,
    category: "drinks",
    image: "plum-wine",
    groups: [],
    ingredients: ["梅のリキュールを氷と提供します", "Japanese plum liqueur served over ice"],
    contains: [],
  },
  {
    id: "shochu",
    ja: "芋焼酎の水割り",
    en: "Sweet-potato shochu with water",
    price: 540,
    category: "drinks",
    image: "shochu",
    groups: [],
    ingredients: ["芋焼酎を水で割ります", "Sweet-potato shochu diluted with water"],
    contains: [],
  },
  {
    id: "oolong",
    ja: "烏龍茶",
    en: "Oolong tea",
    price: 340,
    category: "drinks",
    image: "oolong",
    groups: ["ice"],
    ingredients: ["烏龍茶を選んだ温度で提供します", "Oolong tea served at your chosen temperature"],
    contains: [],
    speech: "ウーロン茶",
  },
  {
    id: "green-tea",
    ja: "緑茶",
    en: "Japanese green tea",
    price: 340,
    category: "drinks",
    image: "green-tea",
    groups: ["ice"],
    ingredients: ["緑茶を選んだ温度で提供します", "Green tea served at your chosen temperature"],
    contains: [],
  },
  {
    id: "yuzu-soda",
    ja: "ゆずソーダ",
    en: "Yuzu citrus soda",
    price: 410,
    category: "drinks",
    image: "yuzu-soda",
    groups: [],
    ingredients: ["ゆず果汁と炭酸水を合わせます", "Yuzu juice mixed with sparkling water"],
    contains: [],
  },
];

function allergenRecord(
  contains: string[] | null,
  ingredients: readonly [string, string],
): Product["allergens"] {
  return {
    contains: contains ?? [],
    evidence: contains === null ? "unknown" : "verified",
    crossContact: "unknown",
    vegan: "unknown",
    note: {
      ja: `合成デモの登録原材料・調理情報：${ingredients[0]}。選択・追加品による成分の違いと、製造・調理・提供時の混入は未確認です。アレルギーはスタッフにご確認ください。`,
      en: `Recorded ingredients and preparation for this fictional demo: ${ingredients[1]}. Ingredient changes from options or extras and cross-contact during production, preparation and service are unverified. Please ask staff about allergies.`,
    },
  };
}

export function demoStores(profile: "smoke" | "demo" | "history") {
  return stores.map((store, storeIndex) => {
    const groups: Modifier[] = groupDefinitions.map((group) => ({
      id: `${store.id}-${group.key}`,
      text: bilingual(group.ja, group.en),
      kind: group.kind,
      min: group.min,
      max: group.max,
      options: group.choices.map(([key, ja, en, priceDelta]) => ({
        id: `${store.id}-${group.key}-${key}`,
        text: bilingual(ja, en),
        priceDelta,
        available: !(group.key === "garnish" && key === "shiso"),
        maxQuantity: group.kind === "quantity" ? 3 : 1,
        requires: [],
        excludes: [],
      })),
    }));
    const modifiers = (keys: GroupKey[]) =>
      groups.filter((group) => keys.some((key) => group.id === `${store.id}-${key}`));
    const sakeProducts: Product[] = sakes.map(
      ([id, ja, reading, en, kind, notesJa, notesEn, price], index) => {
        const [kindJa, kindEn] = sakeKinds[kind];
        const text = bilingual(
          `${store.label} ${ja} ${kindJa}`,
          `${store.english} ${en} ${kindEn}`,
          `${notesJa}。表示価格は60mlです。`,
          `${notesEn}. The displayed price is for 60ml.`,
        );
        text.ja.speechName = `${store.label} ${reading} ${kindJa}`;
        text.en.speechName = `${store.english} ${en}, ${kindEn}`;
        text.ja.aliases = [reading, `${kindJa} ${index + 1}`];
        text.en.aliases = [en, `${kindEn} sake ${index + 1}`];
        return {
          id: `${store.id}-sake-${id}`,
          categoryId: "sake",
          text,
          price,
          available: index !== 25,
          tags: ["sake", "alcohol", ...(index < 2 ? ["popular"] : [])],
          imageKey: `tablecast/demo/${kind === "nigori" ? "nigori" : "sake"}.png`,
          imageKind: "illustration",
          modifiers: modifiers(kind === "sparkling" ? ["serving"] : ["temperature", "serving"]),
          allergens: allergenRecord(
            [],
            [
              `${kindJa}。製造原材料の詳細は未登録です`,
              `${kindEn}; detailed production ingredients are not recorded`,
            ],
          ),
        };
      },
    );
    const otherProducts: Product[] = [...foods, ...drinks].map((item) => {
      const text = bilingual(
        item.ja,
        item.en,
        `${item.ingredients[0]}。`,
        `${item.ingredients[1]}.`,
      );
      text.ja.speechName = item.speech ?? item.ja;
      text.ja.aliases = [
        ...new Set([
          item.speech ?? item.ja,
          item.id === "karaage" ? "からあげ" : item.ja.replaceAll(" ", ""),
        ]),
      ];
      text.en.aliases = [item.en.toLowerCase(), item.id.replaceAll("-", " ")];
      return {
        id: `${store.id}-${item.id}`,
        categoryId: item.category,
        text,
        price: item.price,
        available: item.id !== "hokke",
        tags: [
          ...(["sashimi", "karaage", "yakitori"].includes(item.id) ? ["popular"] : []),
          ...(drinks.slice(0, 5).some((drink) => drink.id === item.id) ? ["alcohol"] : []),
        ],
        imageKey: `tablecast/demo/${item.image}.png`,
        imageKind: "illustration",
        modifiers: modifiers(item.groups),
        allergens: allergenRecord(item.contains, item.ingredients),
      };
    });
    const featuredIds = [
      `${store.id}-sake-tsukinagi`,
      `${store.id}-sashimi`,
      `${store.id}-karaage`,
      `${store.id}-edamame`,
    ];
    const products = [...sakeProducts, ...otherProducts]
      .sort((left, right) => {
        const leftIndex = featuredIds.indexOf(left.id);
        const rightIndex = featuredIds.indexOf(right.id);
        return (
          (leftIndex < 0 ? featuredIds.length : leftIndex) -
          (rightIndex < 0 ? featuredIds.length : rightIndex)
        );
      })
      .filter((product) => profile !== "smoke" || featuredIds.includes(product.id));
    const availableOptions = new Set(
      products.flatMap((product) =>
        product.modifiers.flatMap((group) => group.options.map((option) => option.id)),
      ),
    );
    const configuration: Configuration = configurationSchema.parse({
      categories: categories.map(([id, ja, en]) => ({ id, text: bilingual(ja, en) })),
      products,
      plans: [
        {
          id: `${store.id}-drinks`,
          text: bilingual(
            "日本酒とお飲み物 飲み放題",
            "Sake & drinks selection",
            "対象の日本酒と飲料を二時間。大容量の小瓶は対象外です。",
            "Two hours of selected sake and drinks. Carafes are excluded.",
          ),
          pricePerPerson: 3200,
          durationMinutes: 120,
          lastOrderMinutesBeforeEnd: 30,
          productIds: [],
          categoryIds: ["sake", "drinks"],
          tags: [],
          maxPerOrder: 4,
          maxTotalPerPerson: 8,
          intervalSeconds: 60,
          excludedOptionIds: [`${store.id}-serving-carafe`].filter((option) =>
            availableOptions.has(option),
          ),
          includedOptionSurcharge: false,
        },
        {
          id: `${store.id}-plates`,
          text: bilingual(
            "和食の食べ放題",
            "Japanese plates selection",
            "酒の肴と揚げものが対象。追加の温泉卵は対象外です。",
            "Small plates and fried dishes are included. Extra soft-cooked eggs are excluded.",
          ),
          pricePerPerson: 3800,
          durationMinutes: 120,
          lastOrderMinutesBeforeEnd: 30,
          productIds: [],
          categoryIds: ["small-plates", "fried"],
          tags: [],
          maxPerOrder: 6,
          maxTotalPerPerson: 12,
          intervalSeconds: 90,
          excludedOptionIds: [`${store.id}-topping-egg`].filter((option) =>
            availableOptions.has(option),
          ),
          includedOptionSurcharge: true,
        },
        {
          id: `${store.id}-set`,
          text: bilingual(
            "三品選べる晩酌セット",
            "Choose-three supper set",
            "お造り・唐揚げ・枝豆から一人三品まで選べます。同じ料理も一品として数えます。",
            "Choose up to three plates per person from sashimi, fried chicken and edamame. Repeated dishes each count as one plate.",
          ),
          pricePerPerson: 2200,
          durationMinutes: 90,
          lastOrderMinutesBeforeEnd: 20,
          productIds: [`${store.id}-sashimi`, `${store.id}-karaage`, `${store.id}-edamame`],
          categoryIds: [],
          tags: [],
          maxPerOrder: 3,
          maxTotalPerPerson: 3,
          intervalSeconds: 0,
          excludedOptionIds: [],
          includedOptionSurcharge: true,
        },
      ],
      cast: {
        instructions: {
          ja: "和食と多彩な日本酒を、香り・味わい・好みを一つずつ確かめながら丁寧に案内してください。銘柄は架空のデモ設定です。注文確認は正確に読み、原材料や交差接触が不明な場合は安全と断言せずスタッフへ案内してください。",
          en: "Guide guests courteously through Japanese dishes and a varied sake list, asking about aroma, flavour and preferences one at a time. Brands are fictional demonstration data. Confirm orders accurately and refer unverified ingredients or cross-contact questions to staff without promising safety.",
        },
        voice: { ja: null, en: null },
        proactive: false,
      },
    });
    return {
      id: store.id,
      name: store.name,
      organization: storeIndex === 2 ? "tablecast-koharu-group" : "tablecast-komorebi-group",
      configuration,
      tableCount: profile === "smoke" ? 2 : 12,
    };
  });
}
