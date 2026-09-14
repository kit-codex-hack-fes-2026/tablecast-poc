import { configurationSchema } from "../apps/api/src/schema";
import type { Modifier, Product } from "../apps/api/src/schema";
import { demoImageKey } from "./tablecast-seed-media";
import { demoOptionImageKey } from "./tablecast-demo-option-images";

export const koreanDemoStoreId = "tablecast-hanul";
export const koreanDemoStoreName = "韓国食堂ハヌル三条店";

type KoreanMenuItem = {
  key: string;
  ja: string;
  en: string;
  price: number;
  category: string;
  ingredients: readonly [string, string];
  contains: string[];
  spice: "none" | "mild" | "medium";
  groups: string[];
  tabletop?: boolean;
  hotVessel?: boolean;
  available?: boolean;
  photo: string;
};

// 材料・辛さ・商品写真の被写体を一か所で定義する。店舗や蔵元はすべて架空。
export const koreanDemoMenu: KoreanMenuItem[] = [
  {
    key: "samgyeopsal",
    ja: "サムギョプサル 卓上焼きセット 二人前",
    en: "Samgyeopsal table-grill set for two",
    price: 2680,
    category: "grill",
    ingredients: [
      "豚ばら肉300g、サンチュ6枚、にんにく、みそだれ。みそだれは大豆と小麦を含みます",
      "300g of pork belly, six lettuce leaves, garlic and ssamjang containing soya and wheat",
    ],
    contains: ["soya", "wheat"],
    spice: "mild",
    groups: ["wraps", "ssamjang"],
    tabletop: true,
    photo:
      "One tabletop grill with fully cooked sliced pork belly, six lettuce leaves, garlic and a small ssamjang portion as one set. Meat fully cooked, no raw meat, no flame, no hands. Show the entire set.",
  },
  {
    key: "bulgogi",
    ja: "牛肉のプルコギ",
    en: "Beef bulgogi",
    price: 1480,
    category: "grill",
    ingredients: [
      "牛肉、玉ねぎ、にんじんをしょうゆ、砂糖、ごま油で炒めます",
      "Beef, onion and carrot stir-fried with soy sauce, sugar and sesame oil",
    ],
    contains: ["soya", "wheat", "sesame"],
    spice: "none",
    groups: ["rice"],
    photo:
      "One shallow plate of cooked thin beef, onion and carrot in a glossy soy glaze. No rice or extra side dishes.",
  },
  {
    key: "dakgalbi",
    ja: "鶏と野菜のタッカルビ",
    en: "Chicken and vegetable dakgalbi",
    price: 1380,
    category: "grill",
    ingredients: [
      "鶏もも肉、キャベツ、さつまいも、米のトックをコチュジャンだれで炒めます。たれは大豆と小麦を含みます",
      "Chicken thigh, cabbage, sweet potato and rice cakes cooked in gochujang sauce containing soya and wheat",
    ],
    contains: ["soya", "wheat"],
    spice: "medium",
    groups: ["spice", "hotpot-extras"],
    tabletop: true,
    photo:
      "One low tabletop pan of fully cooked chicken thigh, cabbage, sweet potato and cylindrical rice cakes in red gochujang sauce. No cheese by default, no raw meat, no flames or people.",
  },
  {
    key: "jeyuk",
    ja: "豚肉の甘辛炒め",
    en: "Spicy pork stir-fry",
    price: 1280,
    category: "grill",
    ingredients: [
      "豚肉と玉ねぎをコチュジャン、しょうゆ、ごま油で炒めます",
      "Pork and onion stir-fried with gochujang, soy sauce and sesame oil",
    ],
    contains: ["soya", "wheat", "sesame"],
    spice: "medium",
    groups: ["spice", "rice"],
    photo:
      "One plate of thin fully cooked pork and onion in a red spicy glaze. No extra vegetables, rice or side dishes.",
  },
  {
    key: "bossam",
    ja: "ゆで豚のポッサム",
    en: "Bossam boiled pork wraps",
    price: 1480,
    category: "grill",
    ingredients: [
      "豚ばら肉をしょうがとにんにくでゆで、サンチュ6枚とみそだれを添えます",
      "Pork belly boiled with ginger and garlic, served with six lettuce leaves and ssamjang",
    ],
    contains: ["soya", "wheat"],
    spice: "mild",
    groups: ["wraps", "ssamjang"],
    photo:
      "One platter of neatly sliced fully cooked boiled pork belly, six lettuce leaves and a small portion of ssamjang. No kimchi or rice or other dishes.",
  },
  {
    key: "fried-chicken",
    ja: "韓国フライドチキン 五個",
    en: "Korean fried chicken, five pieces",
    price: 980,
    category: "small-plates",
    ingredients: [
      "鶏もも肉を小麦粉と片栗粉の衣で揚げた五個盛り。基本はソースなしで、選択により材料が変わります",
      "Five chicken-thigh pieces fried in wheat-flour and potato-starch coating; plain by default, with ingredients changing for the selected sauce",
    ],
    contains: ["wheat"],
    spice: "none",
    groups: ["chicken-sauce"],
    photo:
      "Exactly FIVE distinct golden Korean fried chicken thigh pieces, thin crispy coating, plain with no sauce by default, on one stainless serving tray. No fries, radish, garnish or sauce cup.",
  },
  {
    key: "tteokbokki",
    ja: "もちもちトッポギ",
    en: "Tteokbokki rice cakes",
    price: 780,
    category: "small-plates",
    ingredients: [
      "米のトックと魚のすり身揚げをコチュジャンだれで煮ます。小麦、大豆、魚を含みます",
      "Rice cakes and fish cake simmered in gochujang sauce containing wheat, soya and fish",
    ],
    contains: ["wheat", "soya", "fish"],
    spice: "medium",
    groups: ["spice", "hotpot-extras"],
    photo:
      "One shallow bowl of cylindrical rice cakes and flat fish-cake pieces in thick red tteokbokki sauce. No egg, cheese or other topping by default.",
  },
  {
    key: "seafood-pajeon",
    ja: "海鮮ねぎチヂミ 八切れ",
    en: "Seafood and spring-onion pajeon, eight pieces",
    price: 1080,
    category: "small-plates",
    ingredients: [
      "海老、いか、ねぎ、小麦粉、卵を焼き、八切れに分けます",
      "Prawns, squid, spring onion, wheat flour and egg cooked as a pancake and cut into eight pieces",
    ],
    contains: ["crustaceans", "molluscs", "wheat", "egg"],
    spice: "none",
    groups: ["dip"],
    photo:
      "One round seafood-and-spring-onion Korean pancake cut into exactly EIGHT clearly distinguishable wedges, with prawns, squid and long green onion visible. No extra dishes or sauce cups.",
  },
  {
    key: "kimchi-jeon",
    ja: "キムチチヂミ 六切れ",
    en: "Kimchi jeon, six pieces",
    price: 880,
    category: "small-plates",
    ingredients: [
      "白菜キムチ、小麦粉、卵を焼き、六切れに分けます。キムチは魚醤とえびの塩辛を含みます",
      "Cabbage kimchi, wheat flour and egg cooked as a pancake and cut into six pieces; the kimchi contains fish sauce and salted prawns",
    ],
    contains: ["fish", "crustaceans", "wheat", "egg"],
    spice: "mild",
    groups: ["dip"],
    photo:
      "One orange-red cabbage kimchi pancake, cut into exactly SIX clearly separate wedges. No seafood pieces, cheese or extra plates.",
  },
  {
    key: "gimbap",
    ja: "野菜と卵のキンパ 八切れ",
    en: "Vegetable and egg gimbap, eight pieces",
    price: 780,
    category: "rice-noodles",
    ingredients: [
      "ご飯、のり、にんじん、きゅうり、卵、ほうれん草、たくあん、ごま油を巻いた八切れ盛り",
      "Eight slices of a seaweed rice roll with carrot, cucumber, egg, spinach, pickled daikon and sesame oil",
    ],
    contains: ["egg", "sesame"],
    spice: "none",
    groups: [],
    photo:
      "Exactly EIGHT gimbap slices with black nori outside and rice, carrot, cucumber, yellow egg, spinach and yellow pickled daikon visible inside. No meat, crab stick, mayonnaise or extra garnish.",
  },
  {
    key: "bibimbap",
    ja: "牛肉とナムルのビビンバ",
    en: "Beef and vegetable bibimbap",
    price: 980,
    category: "rice-noodles",
    ingredients: [
      "ご飯、牛肉、ほうれん草、にんじん、もやし、きのこ、目玉焼き、ごま油。コチュジャンは別添えです",
      "Rice, beef, spinach, carrot, bean sprouts, mushrooms, a fried egg and sesame oil, with gochujang served separately",
    ],
    contains: ["egg", "sesame", "soya", "wheat"],
    spice: "none",
    groups: ["rice", "bibimbap-protein", "egg", "vegetables"],
    photo:
      "One bibimbap bowl with rice beneath separate sectors of beef, spinach, carrot, bean sprouts and mushrooms, with ONE fried egg centred. A tiny portion of red gochujang beside the bowl belongs to this dish. No other food.",
  },
  {
    key: "naengmyeon",
    ja: "さっぱり韓国冷麺",
    en: "Chilled Korean naengmyeon",
    price: 1080,
    category: "rice-noodles",
    ingredients: [
      "そばと小麦を使う麺を冷たい牛肉出汁で提供し、ゆで卵半分、きゅうり、梨を添えます",
      "Buckwheat and wheat noodles in chilled beef broth with half a boiled egg, cucumber and pear",
    ],
    contains: ["buckwheat", "wheat", "egg"],
    spice: "none",
    groups: ["noodles"],
    photo:
      "One stainless bowl of thin brown buckwheat noodles in chilled clear beef broth with exactly HALF a boiled egg, cucumber strips and a few pear slices. No meat slices or red spicy sauce.",
  },
  {
    key: "jjajangmyeon",
    ja: "豚肉と玉ねぎのジャージャー麺",
    en: "Pork and onion jjajangmyeon",
    price: 1080,
    category: "rice-noodles",
    ingredients: [
      "小麦の麺に豚肉、玉ねぎ、大豆のみそを炒めた黒いソースをかけます",
      "Wheat noodles topped with pork and onion in a dark fermented-soya sauce",
    ],
    contains: ["wheat", "soya"],
    spice: "none",
    groups: ["noodles"],
    photo:
      "One bowl of thick wheat noodles topped with glossy nearly black sauce containing diced pork and onion. No seafood, egg or cucumber garnish.",
  },
  {
    key: "kimchi-jjigae",
    ja: "豚肉と豆腐のキムチチゲ",
    en: "Pork and tofu kimchi jjigae",
    price: 1080,
    category: "soups",
    ingredients: [
      "豚肉、豆腐、白菜キムチ、ねぎを煮込みます。キムチは魚醤とえびの塩辛を含みます",
      "Pork, tofu, cabbage kimchi and spring onion simmered together; the kimchi contains fish sauce and salted prawns",
    ],
    contains: ["soya", "fish", "crustaceans"],
    spice: "medium",
    groups: ["spice", "hotpot-extras", "rice"],
    hotVessel: true,
    photo:
      "One black Korean earthenware bowl of red kimchi stew with cooked pork, tofu cubes, cabbage kimchi and spring onion. No rice or side dishes, no raw egg.",
  },
  {
    key: "sundubu",
    ja: "海鮮スンドゥブチゲ",
    en: "Seafood sundubu jjigae",
    price: 1080,
    category: "soups",
    ingredients: [
      "やわらかい豆腐、あさり、海老、卵、玉ねぎを唐辛子の出汁で煮込み、卵は十分に加熱します",
      "Soft tofu, clams, prawns, egg and onion simmered in chilli broth; the egg is fully cooked",
    ],
    contains: ["soya", "molluscs", "crustaceans", "egg"],
    spice: "medium",
    groups: ["spice", "hotpot-extras", "rice"],
    hotVessel: true,
    photo:
      "One black earthenware bowl of red sundubu stew with soft broken tofu, cooked clams, cooked prawns, onion and a fully set cooked egg. No raw or runny egg, rice or side dishes.",
  },
  {
    key: "seolleongtang",
    ja: "牛骨白湯のソルロンタン",
    en: "Seolleongtang beef-bone soup",
    price: 1180,
    category: "soups",
    ingredients: [
      "牛骨の白い出汁に牛肉とねぎを合わせます。米や麺は含まず、塩は別添えです",
      "Milky beef-bone broth with beef and spring onion; rice and noodles are not included, and salt is served separately",
    ],
    contains: [],
    spice: "none",
    groups: ["rice"],
    hotVessel: true,
    photo:
      "One deep bowl of opaque white beef-bone soup containing thin cooked beef slices and a little spring onion. No rice, noodles, milk carton, side dishes or red chilli.",
  },
  {
    key: "japchae",
    ja: "牛肉と野菜のチャプチェ",
    en: "Beef and vegetable japchae",
    price: 880,
    category: "rice-noodles",
    ingredients: [
      "さつまいもでんぷんの春雨、牛肉、きのこ、ほうれん草、にんじんをしょうゆとごま油で炒めます",
      "Sweet-potato starch noodles, beef, mushrooms, spinach and carrot stir-fried with soy sauce and sesame oil",
    ],
    contains: ["soya", "wheat", "sesame"],
    spice: "none",
    groups: [],
    photo:
      "One plate of translucent brown glass noodles with beef, mushrooms, spinach and carrot in a light glossy dressing. No egg strips, seafood or extra vegetables.",
  },
  {
    key: "mandu",
    ja: "豚肉の蒸しマンドゥ 四個",
    en: "Steamed pork mandu, four dumplings",
    price: 680,
    category: "small-plates",
    ingredients: [
      "豚ひき肉、白菜、にらを小麦の皮で包んで蒸した四個盛り",
      "Four steamed dumplings with minced pork, cabbage and garlic chives in wheat wrappers",
    ],
    contains: ["wheat"],
    spice: "none",
    groups: ["dip"],
    photo:
      "Exactly FOUR large steamed Korean pork mandu with pale pleated wheat wrappers, one whole serving on a small stainless plate. No fried browning, bamboo steamer, dipping cup or side food.",
  },
  {
    key: "kimchi-assortment",
    ja: "キムチ三種盛り",
    en: "Three-kimchi selection",
    price: 580,
    category: "small-plates",
    ingredients: [
      "白菜、大根、きゅうりのキムチ。魚醤、えびの塩辛、にんにく、唐辛子を使います",
      "Cabbage, daikon and cucumber kimchi made with fish sauce, salted prawns, garlic and chilli",
    ],
    contains: ["fish", "crustaceans"],
    spice: "medium",
    groups: [],
    photo:
      "One divided stainless dish with THREE distinct kimchi sections: napa cabbage, daikon cubes and cucumber. All red chilli-seasoned, no other vegetables or food.",
  },
  {
    key: "hotteok",
    ja: "黒糖とシナモンのホットク 二個",
    en: "Brown-sugar and cinnamon hotteok, two pancakes",
    price: 680,
    category: "desserts",
    ingredients: [
      "小麦の生地で黒糖、シナモン、ピーナッツを包んで焼いた二個盛り。熱い蜜に注意してください",
      "Two wheat pancakes filled with brown sugar, cinnamon and peanuts; take care with the hot syrup filling",
    ],
    contains: ["wheat", "peanuts"],
    spice: "none",
    groups: [],
    photo:
      "Exactly TWO golden round hotteok pancakes on one small plate, one slightly opened to show brown-sugar cinnamon syrup and peanut filling. No ice cream, fruit, powder or extra garnish.",
  },
  {
    key: "hanul-soju",
    ja: "ハヌル 清らか焼酎",
    en: "Hanul clear soju",
    price: 780,
    category: "korean-alcohol",
    ingredients: [
      "架空銘柄の米を原料とする焼酎。アルコール16%、360mlの瓶で提供します",
      "Fictional rice-based soju, 16% ABV, served as a 360ml bottle",
    ],
    contains: [],
    spice: "none",
    groups: ["glasses"],
    photo:
      "One short emerald-green 360ml soju bottle with an original crisp white and sky-blue label, plus one small empty shot glass. Label exact Japanese: ハヌル / 清らか焼酎 / 16%. Clear liquid. No real brand or Korean text.",
  },
  {
    key: "yuzu-soju",
    ja: "ハヌル ゆず焼酎",
    en: "Hanul yuzu soju",
    price: 880,
    category: "korean-alcohol",
    ingredients: [
      "架空銘柄の米の焼酎にゆず果汁と糖類を合わせます。アルコール13%、360ml瓶です",
      "Fictional rice soju mixed with yuzu juice and sugar, 13% ABV, in a 360ml bottle",
    ],
    contains: [],
    spice: "none",
    groups: ["glasses"],
    photo:
      "One slender bright-green 360ml soju bottle with an original yellow yuzu motif label and one small empty shot glass. Label exact Japanese: ハヌル / ゆず焼酎 / 13%. Light yellow clear liquid, no fruit props or real brand.",
  },
  {
    key: "rice-makgeolli",
    ja: "ハヌル お米のマッコリ",
    en: "Hanul rice makgeolli",
    price: 880,
    category: "korean-alcohol",
    ingredients: [
      "架空銘柄。米と小麦由来の発酵素材を使う白いにごり酒。アルコール6%、750ml瓶です",
      "Fictional cloudy white rice wine made with rice and wheat-derived fermentation ingredients, 6% ABV, in a 750ml bottle",
    ],
    contains: ["wheat"],
    spice: "none",
    groups: ["glasses"],
    photo:
      "One squat white-translucent 750ml makgeolli bottle with milky rice wine and original blue-and-cream label, plus one small brushed-metal makgeolli bowl. Label exact Japanese: ハヌル / お米のマッコリ / 6%. No real brand.",
  },
  {
    key: "chestnut-makgeolli",
    ja: "ハヌル 栗マッコリ",
    en: "Hanul chestnut makgeolli",
    price: 980,
    category: "korean-alcohol",
    ingredients: [
      "架空銘柄。米、栗、小麦由来の発酵素材を使うにごり酒。アルコール6%、750ml瓶です",
      "Fictional cloudy rice wine made with rice, chestnut and wheat-derived fermentation ingredients, 6% ABV, in a 750ml bottle",
    ],
    contains: ["wheat"],
    spice: "none",
    groups: ["glasses"],
    available: false,
    photo:
      "One round-shouldered 750ml makgeolli bottle containing creamy pale-beige chestnut rice wine, with an original chestnut-brown label and a small metal bowl. Label exact Japanese: ハヌル / 栗マッコリ / 6%. No nuts or other props, no real brand.",
  },
  {
    key: "sanjo-lager",
    ja: "三条ブルーラガー",
    en: "Sanjo Blue lager",
    price: 780,
    category: "korean-alcohol",
    ingredients: [
      "架空銘柄の大麦麦芽とホップを使うラガー。アルコール4.5%、330ml瓶です",
      "Fictional lager brewed with barley malt and hops, 4.5% ABV, in a 330ml bottle",
    ],
    contains: ["barley"],
    spice: "none",
    groups: [],
    photo:
      "One amber-glass 330ml beer bottle with an original cobalt-blue label and a small clear glass of pale-gold lager with white foam. Exact label: 三条 / ブルーラガー / 4.5%. No real brand.",
  },
  {
    key: "yuja-tea",
    ja: "ゆず茶",
    en: "Yuja citrus tea",
    price: 480,
    category: "soft-drinks",
    ingredients: [
      "ゆずの皮と果汁、砂糖を使う韓国風ゆず茶。基本の材料に糖分を含みます",
      "Korean-style yuja tea made with yuzu peel, juice and sugar; its base ingredients contain sugar",
    ],
    contains: [],
    spice: "none",
    groups: ["tea-temperature", "sweetness"],
    photo:
      "One clear handled cup of warm golden yuzu tea with fine yuzu peel strands visible in the drink. No whole fruit or other food.",
  },
  {
    key: "corn-tea",
    ja: "とうもろこし茶",
    en: "Roasted corn tea",
    price: 380,
    category: "soft-drinks",
    ingredients: [
      "焙煎したとうもろこしをお湯で抽出します。基本は無糖です",
      "Roasted corn infused in water, unsweetened by default",
    ],
    contains: [],
    spice: "none",
    groups: ["tea-temperature"],
    photo:
      "One stainless Korean drinking cup containing clear pale-amber roasted corn tea. No floating corn kernels, fruit or garnish.",
  },
  {
    key: "sikhye",
    ja: "お米の甘酒風ドリンク シッケ",
    en: "Sikhye sweet rice drink",
    price: 480,
    category: "soft-drinks",
    ingredients: [
      "米、大麦麦芽、砂糖を使う冷たいノンアルコールドリンク。甘酒とは製法が異なります",
      "A chilled non-alcoholic drink made with rice, barley malt and sugar; it is prepared differently from amazake",
    ],
    contains: ["barley"],
    spice: "none",
    groups: ["ice"],
    photo:
      "One clear glass of pale cloudy beige Korean sikhye with a few cooked rice grains naturally visible near the bottom. Chilled, no fruit or decorative garnish.",
  },
  {
    key: "pear-soda",
    ja: "韓国梨のソーダ",
    en: "Korean pear soda",
    price: 480,
    category: "soft-drinks",
    ingredients: ["梨果汁、炭酸水、砂糖を合わせます", "Pear juice, sparkling water and sugar"],
    contains: [],
    spice: "none",
    groups: ["ice", "sweetness"],
    photo:
      "One tall clear glass of lightly cloudy pale-ivory pear soda with fine carbonation and modest ice. No pear slices or other fruit garnish.",
  },
  {
    key: "sujeonggwa",
    ja: "しょうがとシナモンのスジョンガ",
    en: "Sujeonggwa ginger and cinnamon punch",
    price: 480,
    category: "soft-drinks",
    ingredients: [
      "しょうが、シナモン、砂糖を煮出して冷やしたノンアルコールドリンク",
      "A chilled non-alcoholic infusion of ginger, cinnamon and sugar",
    ],
    contains: [],
    spice: "mild",
    groups: ["ice", "sweetness"],
    photo:
      "One low clear glass of translucent reddish-brown ginger-cinnamon punch with modest ice. No dried persimmon, pine nuts, cinnamon stick, ginger pieces or extra garnish.",
  },
];

function text(ja: string, en: string, descriptionJa = "", descriptionEn = ""): Product["text"] {
  return {
    ja: { displayName: ja, speechName: ja, description: descriptionJa, aliases: [ja] },
    en: {
      displayName: en,
      speechName: en,
      description: descriptionEn,
      aliases: [en.toLowerCase()],
    },
  };
}

type Choice = readonly [string, string, string, number];
function group(
  key: string,
  ja: string,
  en: string,
  choices: Choice[],
  kind: Modifier["kind"] = "single",
  min = 1,
  max = 1,
): Modifier {
  return {
    id: `${koreanDemoStoreId}-${key}`,
    text: text(ja, en),
    kind,
    min,
    max,
    options: choices.map(([id, optionJa, optionEn, priceDelta]) => ({
      id: `${koreanDemoStoreId}-${key}-${id}`,
      text: text(optionJa, optionEn),
      priceDelta,
      available: true,
      imageKey: demoOptionImageKey(`${koreanDemoStoreId}-${key}-${id}`),
      imageKind: "illustration",
      maxQuantity: kind === "quantity" ? 2 : 1,
      requires: [],
      excludes: [],
    })),
  };
}

export const koreanDemoModifierGroups: Record<string, Modifier> = {
  spice: group("spice", "辛さ", "Chilli level", [
    ["mild", "控えめ・辛味あり", "Milder, still contains chilli", 0],
    ["standard", "通常", "Standard", 0],
    ["hot", "辛め", "Hotter", 0],
  ]),
  rice: group("rice", "ご飯を追加", "Add rice", [
    ["none", "追加なし", "No extra rice", 0],
    ["small", "小ご飯", "Small rice", 150],
    ["regular", "ご飯", "Regular rice", 200],
  ]),
  wraps: group("wraps", "包み野菜", "Wrapping leaves", [
    ["lettuce", "サンチュ六枚", "Six lettuce leaves", 0],
    ["mixed", "サンチュ三枚とえごま三枚", "Three lettuce and three perilla leaves", 100],
    ["extra", "サンチュ十枚", "Ten lettuce leaves", 150],
  ]),
  ssamjang: group("ssamjang", "みそだれ", "Ssamjang", [
    ["side", "別添え", "On the side", 0],
    ["none", "みそだれなし", "No ssamjang", 0],
  ]),
  "chicken-sauce": group("chicken-sauce", "チキンのソース", "Chicken sauce", [
    ["plain", "ソースなし", "No sauce", 0],
    ["yangnyeom", "甘辛ヤンニョム", "Sweet-spicy yangnyeom", 100],
    ["soy-garlic", "しょうゆガーリック", "Soy and garlic", 100],
    ["honey-mustard", "ハニーマスタード", "Honey mustard", 100],
  ]),
  dip: group("dip", "つけだれ", "Dipping sauce", [
    ["soy-vinegar", "しょうゆ酢だれ", "Soy-vinegar dip", 0],
    ["chilli", "唐辛子入りしょうゆだれ", "Soy-chilli dip", 0],
    ["none", "たれなし", "No dip", 0],
  ]),
  "bibimbap-protein": group("bibimbap-protein", "ビビンバの具", "Bibimbap protein", [
    ["beef", "牛肉", "Beef", 0],
    ["tofu", "豆腐に変更", "Replace with tofu", -100],
    ["none", "牛肉なし", "No beef", -200],
  ]),
  egg: group("egg", "目玉焼き", "Fried egg", [
    ["yes", "あり", "Include egg", 0],
    ["none", "卵なし", "No egg", -80],
  ]),
  vegetables: group(
    "vegetables",
    "抜くナムル",
    "Vegetables to leave out",
    [
      ["spinach", "ほうれん草抜き", "No spinach", 0],
      ["sprouts", "もやし抜き", "No bean sprouts", 0],
      ["mushrooms", "きのこ抜き", "No mushrooms", 0],
    ],
    "multiple",
    0,
    3,
  ),
  "hotpot-extras": group(
    "hotpot-extras",
    "追加トッピング",
    "Extra toppings",
    [
      ["cheese", "チーズ", "Cheese", 150],
      ["rice-cakes", "トック", "Rice cakes", 180],
      ["ramyeon", "ラーメン", "Ramyeon noodles", 200],
    ],
    "quantity",
    0,
    4,
  ),
  noodles: group("noodles", "麺の量", "Noodle portion", [
    ["regular", "通常", "Regular", 0],
    ["large", "大盛り", "Large", 150],
  ]),
  glasses: group("glasses", "取り分け用の器", "Sharing cups", [
    ["two", "二人分", "Two cups", 0],
    ["three", "三人分", "Three cups", 0],
    ["four", "四人分", "Four cups", 0],
  ]),
  "tea-temperature": group("tea-temperature", "温度", "Temperature", [
    ["hot", "温かい", "Hot", 0],
    ["cold", "冷たい", "Cold", 0],
  ]),
  ice: group("ice", "氷", "Ice", [
    ["standard", "通常", "Regular ice", 0],
    ["less", "少なめ", "Less ice", 0],
    ["none", "氷なし", "No ice", 0],
  ]),
  sweetness: group("sweetness", "甘さ", "Sweetness", [
    ["regular", "通常", "Regular", 0],
    ["lighter", "甘さ控えめ・糖分あり", "Less sweet, contains sugar", 0],
  ]),
};

const commonNote = {
  ja: "架空デモの登録材料です。調味料の全成分・選択変更による成分差・交差接触は未確認です。ハラール、コーシャ等の宗教認証とヴィーガン適合は未確認です。材料名や肉抜きだけで適合を保証せず、スタッフへ確認してください。",
  en: "These are recorded ingredients for a fictional demo. Full condiment ingredients, changes from options and cross-contact are unverified. Halal, kosher and other religious certification, and vegan suitability, are unverified. Ingredients or removing meat do not guarantee suitability; ask staff.",
};

export function koreanDemoStore(profile: "smoke" | "demo" | "history") {
  const featured = ["samgyeopsal", "bibimbap", "fried-chicken", "yuja-tea"];
  const products: Product[] = koreanDemoMenu
    .filter((item) => profile !== "smoke" || featured.includes(item.key))
    .map((item) => {
      const spiceDescription = {
        none: [
          "基本は唐辛子の辛さなし。選ぶソースにより変わります。",
          "No chilli heat by default; selected sauces may change this.",
        ],
        mild: [
          "基本は控えめな刺激があります。辛味なしの保証ではありません。",
          "Mild by default; this is not a promise of no heat.",
        ],
        medium: [
          "基本は唐辛子の辛味があります。控えめを選んでも辛味は残ります。",
          "Contains chilli heat by default; a milder selection still contains chilli.",
        ],
      }[item.spice];
      const spice = ["korean-alcohol", "soft-drinks", "desserts"].includes(item.category)
        ? ["", ""]
        : spiceDescription;
      const safety = item.tabletop
        ? [
            "卓上加熱はスタッフが操作します。肉は中心まで十分に加熱し、生肉用トングと食用を分けます。熱い鉄板や加熱機器に触れず、調整はスタッフを呼んでください。",
            "Staff operate the tabletop heater. Meat must be thoroughly cooked through, with separate raw-meat and eating utensils. Do not touch the hot pan or heater; ask staff to adjust it.",
          ]
        : item.hotVessel
          ? [
              "鍋と出汁は熱くなっています。器に触れず、取り分けや移動はスタッフにご相談ください。",
              "The bowl and broth are hot. Avoid touching the vessel and ask staff for help sharing or moving it.",
            ]
          : ["", ""];
      const description = {
        ja: `${item.ingredients[0]}。${spice[0]}${safety[0]}${commonNote.ja}`,
        en: `${item.ingredients[1]}. ${spice[1]} ${safety[1]} ${commonNote.en}`,
      };
      return {
        id: `${koreanDemoStoreId}-${item.key}`,
        categoryId: item.category,
        text: text(item.ja, item.en, description.ja, description.en),
        price: item.price,
        available: item.available ?? true,
        tags: [
          ...(item.category === "korean-alcohol" ? ["alcohol"] : []),
          ...(item.tabletop ? ["tabletop-cooking"] : []),
        ],
        imageKey: demoImageKey(`hanul-${item.key}.webp`),
        imageKind: "illustration",
        modifiers: item.groups.map((key) => {
          const value = koreanDemoModifierGroups[key];
          if (!value) throw new Error(`韓国店の選択肢がありません: ${key}`);
          return value;
        }),
        allergens: {
          contains: item.contains,
          evidence: "verified",
          crossContact: "unknown",
          vegan: "unknown",
          note: description,
        },
      };
    });
  return {
    id: koreanDemoStoreId,
    name: koreanDemoStoreName,
    tableCount: profile === "smoke" ? 2 : 12,
    configuration: configurationSchema.parse({
      categories: (
        [
          ["grill", "肉料理・卓上焼き", "Meat dishes and table grilling"],
          ["small-plates", "チヂミ・小皿", "Pancakes and small plates"],
          ["rice-noodles", "ご飯・麺", "Rice and noodles"],
          ["soups", "チゲ・スープ", "Stews and soups"],
          ["desserts", "甘いもの", "Desserts"],
          ["korean-alcohol", "韓国のお酒", "Korean drinks with alcohol"],
          ["soft-drinks", "お茶・ノンアルコール", "Tea and non-alcoholic drinks"],
        ] as const
      ).map(([id, ja, en]) => ({ id, text: text(ja, en) })),
      products,
      plans: [
        {
          id: `${koreanDemoStoreId}-tea-selection`,
          text: text(
            "韓国茶と果実ドリンク 飲み放題",
            "Korean tea and fruit drink selection",
            "90分、一人4杯まで。お酒は対象外です。",
            "Ninety minutes, up to four drinks per person. Alcoholic drinks are excluded.",
          ),
          pricePerPerson: 1280,
          durationMinutes: 90,
          lastOrderMinutesBeforeEnd: 20,
          productIds: [],
          categoryIds: ["soft-drinks"],
          tags: [],
          maxPerOrder: 4,
          maxTotalPerPerson: 4,
          intervalSeconds: 60,
          excludedOptionIds: [],
          includedOptionSurcharge: true,
        },
      ],
      cast: {
        instructions: {
          ja: "韓国食堂ハヌル三条店の接客担当です。料理の日本語名と材料、辛さ、取り分けの量を一つずつ説明してください。卓上調理は必ずスタッフが加熱機器を操作し、十分な加熱と熱い器への注意を案内します。辛さ控えめでも辛味は残る商品があります。宗教認証・ヴィーガン適合・交差接触は未確認です。肉抜き、植物性の具材やノンアルコールという名前だけで安全・適合を保証せず、スタッフへつないでください。",
          en: "You host guests at the fictional Hanul Sanjo Korean kitchen. Explain dishes, ingredients, heat and sharing portions one point at a time. Staff must operate tabletop heaters; explain thorough cooking and hot-vessel precautions. Milder dishes may still contain chilli. Religious certification, vegan suitability and cross-contact are unverified. Do not promise safety or suitability from meat removal, plant ingredients or a non-alcoholic name alone; ask staff to help.",
        },
        voice: { ja: null, en: null },
        proactive: false,
      },
    }),
  };
}
