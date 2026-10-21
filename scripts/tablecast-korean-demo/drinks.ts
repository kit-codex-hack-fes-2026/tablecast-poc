import type { KoreanMenuItem } from "./types.ts";
export const drinks: KoreanMenuItem[] = [
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
