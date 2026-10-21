import type { KoreanMenuItem } from "./types.ts";
export const mains: KoreanMenuItem[] = [
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
];
