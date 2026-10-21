import type { KoreanMenuItem } from "./types.ts";
export const sides: KoreanMenuItem[] = [
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
];
