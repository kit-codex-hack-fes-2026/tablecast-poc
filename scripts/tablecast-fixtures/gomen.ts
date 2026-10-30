import { configurationSchema, type Modifier, type Product } from "@tablecast/api/schema";
import {
  demoImageKey,
  demoStoreBanner,
  demoStoreLogo,
  demoThemeImage,
} from "../tablecast-seed-media.ts";
import { allergenRecord } from "./text.ts";

const storeId = "tablecast-gomen";
const name = "剛麺研究所 一乗寺店（デモ）";
type Names = readonly [string, string, string, string];

function text(names: Names, description: Names = names, reading = names[0]) {
  const content = (index: number) => {
    const displayName = names[index] ?? names[0];
    const transliteration = index === 0 ? reading : displayName;
    return {
      displayName,
      transliteration,
      speechName: transliteration,
      description: description[index] ?? description[0],
      aliases: [displayName, ...(index === 0 ? [reading] : [])],
    };
  };
  return { ja: content(0), en: content(1), "zh-Hans": content(2), ko: content(3) };
}

function group(
  key: string,
  names: Names,
  choices: readonly (readonly [string, Names, number])[],
  required = true,
): Modifier {
  return {
    id: `${storeId}-${key}`,
    text: text(names),
    kind: required ? "single" : "multiple",
    min: required ? 1 : 0,
    max: required ? 1 : choices.length,
    options: choices.map(([id, labels, priceDelta]) => ({
      id: `${storeId}-${key}-${id}`,
      text: text(labels),
      priceDelta,
      available: true,
      imageKey: null,
      imageKind: "illustration",
      maxQuantity: 1,
      requires: [],
      excludes: [],
    })),
  };
}

const calls = [
  group(
    "garlic",
    ["ニンニク", "Garlic", "蒜末", "마늘"],
    [
      ["none", ["なし", "None", "不加", "빼기"], 0],
      ["regular", ["あり", "Regular", "普通", "보통"], 0],
      ["extra", ["マシ", "Extra", "加量", "많이"], 0],
    ],
  ),
  group(
    "vegetables",
    ["ヤサイ", "Vegetables", "蔬菜", "채소"],
    [
      ["regular", ["普通", "Regular", "普通", "보통"], 0],
      ["less", ["少なめ", "Less", "少量", "적게"], 0],
      ["extra", ["マシ", "Extra", "加量", "많이"], 0],
      ["double", ["マシマシ", "Double extra", "双倍加量", "아주 많이"], 0],
    ],
  ),
  group(
    "fat",
    ["アブラ", "Pork fat", "猪背脂", "돼지 비계"],
    [
      ["regular", ["普通", "Regular", "普通", "보통"], 0],
      ["none", ["なし", "None", "不加", "빼기"], 0],
      ["less", ["少なめ", "Less", "少量", "적게"], 0],
      ["extra", ["マシ", "Extra", "加量", "많이"], 0],
    ],
  ),
  group(
    "seasoning",
    ["カラメ（醤油だれ）", "Soy seasoning", "酱油调味", "간장 양념"],
    [
      ["regular", ["普通", "Regular", "普通", "보통"], 0],
      ["light", ["薄め", "Light", "清淡", "싱겁게"], 0],
      ["strong", ["カラメ", "Stronger soy flavour", "浓味", "진하게"], 0],
    ],
  ),
  group(
    "extras",
    ["有料トッピング", "Extra toppings", "付费配料", "추가 토핑"],
    [
      ["pork", ["豚マシ", "Extra braised pork", "加叉烧", "차슈 추가"], 250],
      ["egg", ["生卵", "Raw egg", "生鸡蛋", "날달걀"], 50],
      ["cheese", ["チェダーチーズ", "Cheddar cheese", "切达奶酪", "체더치즈"], 50],
    ],
    false,
  ),
];

const instructions = {
  ja: "あなたは架空の剛麺研究所の職人気質の店主。実在する参考店舗の店主の再現ではない。低めで落ち着いた声、短い文で『麺は小200、並300、大400グラム。無理せず食べ切れる量でいこう』『ニンニクは入れる？』と話す。無愛想でも威圧・罵倒・差別・食べ残しの強要はしない。初めての客には専門用語を一つずつ説明する。麺の量は商品、小200g・並300g・大400gから選ぶ。カラメは辛さではなく醤油だれの濃さ。無料コールはニンニク・ヤサイ・アブラ・カラメ。客がまとめて指定した内容を全部保持し、未指定の必須項目だけ一つずつ聞く。ヤサイマシマシ、ニンニクマシ、アブラなし等の略語を対応する選択肢へ反映する。通常量を勝手に確定しない。生卵・チーズ・豚マシは有料で、追加前に金額を伝える。少なめやニンニクなしを嫌がらない。原材料と交差接触は未確認。アレルギー相談は安全と断言せず店員へ。商品名・サイズ・全変更点・数量・APIの合計を短く復唱し、客の明示承認後だけ注文を確定する。注文後の変更・実際の支払い・不明な店舗ルールは店員に確認する。チラシは定番のおすすめで、期間限定や値引きではない。",
  en: "You are the calm, no-nonsense craftsman at fictional Gomen Research, not an imitation of any real restaurant owner. Use a low, steady voice and short, friendly sentences: 'Small is 200 grams. Regular 300. Large 400. Choose what you can finish.' Never intimidate, insult, discriminate or pressure guests to eat. Explain unfamiliar terms to first-time visitors. Noodle weight is selected through the small, regular or large product. Karame means stronger soy seasoning, not chilli heat. Ask only one missing required choice at a time: garlic, vegetables, pork fat and soy seasoning. Retain all choices already supplied together. Raw egg, cheddar and extra pork cost extra; state prices before adding them. Respect smaller portions and no garlic. Ingredients and cross-contact are unverified; refer allergy questions to staff. Briefly repeat the product, size, every change, quantity and API total, then obtain explicit approval before submitting. Refer post-order changes, actual payment and uncertain shop rules to staff. The flyer recommends regular menu items; it is not a limited-time offer or discount.",
};

export function gomenDemoStore(profile: "demo" | "history" | "smoke") {
  const products: Product[] = [false, true].flatMap((dry) =>
    [200, 300, 400].map((grams, index) => {
      const sizes = ["小", "並", "大"];
      const english = ["Small", "Regular", "Large"];
      const description: Names = [
        `${grams}gの極太麺、豚2枚、もやしとキャベツ。${dry ? "スープを張らず醤油だれで和えます" : "豚骨醤油スープで仕上げます"}。コールと有料トッピングを選べます。原材料・交差接触は未確認。画像・価格はデモ用。`,
        `${grams}g thick noodles, two slices of braised pork, bean sprouts and cabbage. ${dry ? "Tossed in soy sauce without soup." : "Served in pork and soy broth."} Choose free customisations and optional paid toppings. Ingredients and cross-contact are unverified. Demo illustration and price.`,
        `${grams}克粗面、两片叉烧、豆芽与卷心菜。${dry ? "无汤酱油拌面。" : "猪骨酱油汤面。"}可选免费调整与付费配料。原材料与交叉接触未经确认。演示图片与价格。`,
        `굵은 면 ${grams}g, 차슈 두 장, 숙주와 양배추. ${dry ? "국물 없이 간장 양념에 비빕니다." : "돼지뼈 간장 국물."}무료 조절과 유료 토핑을 선택하세요. 원재료와 교차 접촉 미확인. 데모 이미지와 가격.`,
      ];
      return {
        id: `${storeId}-${dry ? "soupless" : "ramen"}-${grams}`,
        categoryId: dry ? "soupless" : "ramen",
        text: text(
          [
            `${dry ? "汁なし" : "ラーメン"} ${sizes[index]} ${grams}g`,
            `${english[index]} ${dry ? "soupless noodles" : "ramen"} ${grams}g`,
            `${dry ? "无汤拌面" : "拉面"} ${grams}克`,
            `${dry ? "국물 없는 비빔면" : "라멘"} ${grams}g`,
          ],
          description,
          `${dry ? "しるなし" : "ラーメン"} ${index === 0 ? "しょう" : index === 1 ? "なみ" : "だい"} ${grams}グラム`,
        ),
        price: 850 + index * 50,
        available: !(dry && grams === 400),
        tags: index === 1 ? ["popular"] : [],
        imageKey: demoImageKey(dry ? "gomen-soupless.webp" : "gomen-ramen.webp"),
        imageKind: "illustration",
        modifiers: calls,
        foodInfo: allergenRecord(null),
      };
    }),
  );
  products.push({
    id: `${storeId}-pork-takeaway`,
    categoryId: "takeaway",
    text: text(
      ["持ち帰り豚 400g", "Takeaway braised pork 400g", "外带叉烧 400克", "포장 차슈 400g"],
      [
        "持ち帰り用の煮豚。店員から受け取ってください。原材料・交差接触は未確認。",
        "Braised pork to take away. Collect from staff. Ingredients and cross-contact are unverified.",
        "外带卤猪肉，请向店员领取。原材料与交叉接触未经确认。",
        "포장용 차슈. 직원에게 받으세요. 원재료와 교차 접촉 미확인.",
      ],
    ),
    price: 1000,
    available: true,
    tags: [],
    imageKey: null,
    imageKind: "illustration",
    modifiers: [],
    foodInfo: allergenRecord(null),
  });
  products.push({
    id: `${storeId}-oolong`,
    categoryId: "drinks",
    text: text(
      ["烏龍茶", "Oolong tea", "乌龙茶", "우롱차"],
      [
        "冷たい烏龍茶。価格はデモ設定です。",
        "Chilled oolong tea. Demo price.",
        "冰乌龙茶。演示价格。",
        "차가운 우롱차. 데모 가격.",
      ],
      "ウーロンちゃ",
    ),
    price: 200,
    available: true,
    tags: [],
    imageKey: demoImageKey("komorebi-oolong.webp"),
    imageKind: "illustration",
    modifiers: [],
    foodInfo: allergenRecord(null),
  });
  const logo = demoStoreLogo(storeId, name);
  const flyer = demoThemeImage("gomen-flyer.webp", {
    ja: "剛麺ラーメンの定番おすすめ。商品リンクから麺量を選べます",
    en: "Gomen ramen recommendation. Choose noodle size using the product links.",
  });
  const paper = demoThemeImage("gomen-background.webp", {
    ja: "墨と和紙の背景",
    en: "Ink and washi paper background",
  });
  return {
    id: storeId,
    name,
    tableCount: profile === "smoke" ? 2 : 10,
    configuration: configurationSchema.parse({
      storeName: name,
      languages: ["ja", "en", "zh-Hans", "ko"],
      categories: (
        [
          ["ramen", ["ラーメン", "Ramen", "拉面", "라멘"]],
          ["soupless", ["汁なし", "Soupless noodles", "无汤拌面", "국물 없는 비빔면"]],
          ["takeaway", ["持ち帰り", "Takeaway", "外带", "포장"]],
          ["drinks", ["飲み物", "Drinks", "饮料", "음료"]],
        ] as const
      ).map(([id, labels]) => ({ id, text: text(labels) })),
      products:
        profile === "smoke"
          ? products.filter((item) => item.id.endsWith("-300") || item.id.endsWith("-oolong"))
          : products,
      plans: [],
      cast: {
        instructions,
        voice: { ja: null, en: null },
        proactive: false,
        skills: [
          {
            id: "gomen-guide",
            files: [
              {
                path: "SKILL.md",
                content:
                  "---\nname: gomen-guide\ndescription: 剛麺研究所の麺量・コール・営業時間・支払・安全案内。Gomen portions, customisations and shop policies.\n---\n# 剛麺研究所（架空デモ）\n初来店や店舗ルールの質問には references/shop.md を参照する。実在店の公式情報として案内しない。For shop questions, read references/shop.md. This is a fictional demo venue.",
              },
              {
                path: "references/shop.md",
                content:
                  "# 登録済みのデモ営業設定 / Demo shop policies\n京都・一乗寺のカウンター10席を想定。火〜金17:00〜23:00、土12:00〜15:00・17:00〜23:00。月・日休み。予約受付なし。支払は店頭で現金、アプリ内決済なし。持ち帰り豚は店員から受け取る。水はセルフサービス。現地ルールや営業変更は店員に確認する。\nCounter seating for ten in Ichijoji, Kyoto. Tue–Fri 17:00–23:00, Sat 12:00–15:00 and 17:00–23:00. Closed Sun/Mon. No bookings. Cash payment to staff; no in-app payment. Collect takeaway pork from staff. Self-service water. Ask staff about operational changes.\n\n# 麺とコール / Portions and customisations\n麺量は茹でる前のデモ設定。小200g、並300g、大400g。ニンニク=garlic、ヤサイ=vegetables、アブラ=pork fat、カラメ=stronger soy seasoning（辛さではない）。コールは無料、生卵50円・チーズ50円・豚マシ250円は追加料金。変更は注文前に確認、確定後は店員に相談。食べ切れる量を案内し、増量を強要しない。Ingredients and cross-contact are unverified; never promise allergy safety.\n\n# 出所 / Provenance\nラーメン荘 夢を語れの食べログ https://tabelog.com/kyoto/A2601/A260303/26003256/ と2022-10-22更新のメニュー頁を参考にした架空店。価格は参考時点のデモ値で現在の実価格ではない。接客人格・画像・セルフ水等は独自設定。実在店の支店でも公式資料でもない。Inspired by historical public menu information; not affiliated with or endorsed by the reference venue.",
              },
            ],
          },
        ],
      },
      branding: { logo, banner: demoStoreBanner(storeId, name) },
      appearance: {
        colours: { ink: "#241B13", paper: "#F5EAD2", accent: "#A51E18" },
        fonts: { heading: "serif", body: "sans" },
        composition: {
          masthead: {
            visible: true,
            align: "center",
            logoWidth: 260,
            logoHeight: 100,
            padding: 12,
          },
          banners: { columns: 1, gap: 16 },
        },
        assets: { paper },
        parts: {
          menu: {
            background: "#F5EAD2",
            image: { asset: "paper", fit: "cover", x: 50, y: 50, opacity: 0.2 },
          },
          header: {
            background: "#F5EAD2",
            foreground: "#241B13",
            borderColor: "#A51E18",
            borderWidth: 2,
          },
          conversation: { background: "#FFF9EF" },
          "product-card": {
            background: "#FFF9EF",
            radius: 4,
            borderColor: "#241B13",
            borderWidth: 1,
            shadow: "offset",
          },
          "category-button": { radius: 4, borderColor: "#A51E18", borderWidth: 1, font: "serif" },
          checkout: { background: "#F5EAD2" },
          dialog: { background: "#FFF9EF" },
        },
        customCss:
          '[data-theme-part="menu"]{padding:16px}[data-theme-part="product-card"]{border-style:solid}[data-theme-part="category-button"][aria-pressed=true]{background-color:#A51E18;color:#FFF9EF}',
      },
      banners: [
        {
          id: "gomen-signature",
          image: flyer,
          enabled: true,
          span: "full",
          hotspots: [
            {
              id: "gomen-regular",
              productId: `${storeId}-ramen-300`,
              rect: { x: 0, y: 0, width: 1, height: 1 },
            },
          ],
        },
      ],
    }),
  };
}
