import { describe, expect, it } from "vitest";
import { createMenuSearch, menuSearchPage } from "../src/modules/catalog/search";
import { configurationSchema } from "../src/modules/configuration/model";
import { legacyFoodInformation } from "../src/schema";

const text = (ja: string, en: string, description = "") => ({
  ja: { displayName: ja, speechName: ja, aliases: [], description },
  en: { displayName: en, speechName: en, aliases: [], description: "" },
});
const product = (id: string, ja: string, en: string, description = "") => ({
  id,
  categoryId: "tablecast-food",
  text: text(ja, en, description),
  price: 600,
  available: true,
  foodInfo: legacyFoodInformation({
    contains: [],
    evidence: "unknown",
    crossContact: "unknown",
    vegan: "unknown",
    note: { ja: "", en: "" },
  }),
});
function menu(
  products = [
    product("tablecast-chicken", "鶏の唐揚げ", "Fried chicken", "柚子を添えた料理"),
    product("tablecast-salad", "彩りサラダ", "Garden salad", "旬野菜の冷たい前菜"),
  ],
) {
  const configuration = configurationSchema.parse({
    categories: [{ id: "tablecast-food", text: text("お料理", "Food") }],
    products,
    plans: [],
    cast: { instructions: { ja: "", en: "" }, voice: { ja: null, en: null }, proactive: false },
  });
  const chicken = configuration.products[0];
  if (chicken) {
    chicken.text.ja.speechName = "とりのからあげ";
    chicken.text.ja.aliases = ["からあげ", "", " "];
  }
  return configuration;
}

describe("音声と店側で共有するメニュー検索", () => {
  it.each(["からあげ", "カラアゲ", "ｶﾗｱｹﾞ", "カラアケ\u3099", "  カラアゲ  ", "FRIED CHICKEN"])(
    "%sの表記を正規化して同じ商品を特定する",
    (query) => {
      expect(createMenuSearch(menu())(query)).toEqual({ ids: ["tablecast-chicken"], detail: true });
    },
  );

  it.each(["からあけ", "からげ", "fried chiken"])(
    "誤字・脱字の%sを候補へ含め、詳細として確定しない",
    (query) => {
      expect(createMenuSearch(menu())(query)).toEqual({
        ids: ["tablecast-chicken"],
        detail: false,
      });
    },
  );

  it("登録名を含む自然な照会と名前の部分一致で一商品を特定できる", () => {
    const search = createMenuSearch(menu());
    for (const query of ["からあげを一つ", "唐揚げ"])
      expect(search(query)).toEqual({ ids: ["tablecast-chicken"], detail: true });
  });

  it("説明文の末尾から検索でき、説明文だけの一致には概要を返す", () => {
    const configuration = menu();
    const salad = configuration.products[1];
    if (!salad) throw new Error("サラダfixtureがありません");
    salad.text.ja.description = `${"旬の野菜を使った前菜です。".repeat(100)}山椒風味`;
    expect(createMenuSearch(configuration)("山椒風味")).toEqual({
      ids: ["tablecast-salad"],
      detail: false,
    });
  });

  it("商品・カテゴリIDは完全一致だけを使い、JSONのキー名や内部の価格を検索しない", () => {
    const search = createMenuSearch(menu());
    expect(search("TABLECAST-CHICKEN")).toEqual({ ids: ["tablecast-chicken"], detail: true });
    expect(search("tablecast-food")).toEqual({
      ids: ["tablecast-chicken", "tablecast-salad"],
      detail: false,
    });
    for (const query of ["tablecast-chicke", "displayName", "available", "600", "未登録の銘柄"])
      expect(search(query)).toEqual({ ids: [], detail: false });
  });

  it("名前の完全一致を説明文・曖昧一致より優先して絞る", () => {
    const configuration = menu([
      product("tablecast-mention", "前菜", "Starter", "彩りサラダと合わせてどうぞ"),
      product("tablecast-exact", "彩りサラダ", "Garden salad"),
      product("tablecast-similar", "彩りサラダ盛り", "Salad selection"),
    ]);
    expect(createMenuSearch(configuration)("彩りサラダ")).toEqual({
      ids: ["tablecast-exact"],
      detail: true,
    });
  });

  it("カテゴリの別名の完全一致で他カテゴリへの曖昧一致を除く", () => {
    const configuration = menu();
    const category = configuration.categories[0];
    const salad = configuration.products[1];
    if (!category || !salad) throw new Error("カテゴリfixtureがありません");
    category.text.en.aliases.push("Sah keh");
    configuration.categories.push({ id: "tablecast-sashimi", text: text("刺身", "Sashimi") });
    salad.categoryId = "tablecast-sashimi";
    expect(createMenuSearch(configuration)("SAH KEH")).toEqual({
      ids: ["tablecast-chicken"],
      detail: false,
    });
  });

  it("名前・別名、カテゴリ、説明文の順に同じ語の一致を評価する", () => {
    const configuration = menu([
      product("tablecast-description", "前菜", "Starter", "柚子を使用"),
      product("tablecast-category", "焼き物", "Grilled dish"),
      product("tablecast-name", "柚子唐揚げ", "Citrus chicken"),
    ]);
    configuration.categories.push({
      id: "tablecast-citrus",
      text: text("柚子料理", "Citrus dishes"),
    });
    const category = configuration.products[1];
    if (!category) throw new Error("カテゴリ商品fixtureがありません");
    category.categoryId = "tablecast-citrus";
    expect(createMenuSearch(configuration)("柚子").ids).toEqual([
      "tablecast-name",
      "tablecast-category",
      "tablecast-description",
    ]);
  });

  it("空白区切りはOR検索で、全語が別フィールドに一致する商品を先に返す", () => {
    const configuration = menu([
      product("tablecast-citrus", "柚子の前菜", "Citrus starter"),
      product("tablecast-chicken", "鶏肉の前菜", "Chicken starter"),
      product("tablecast-both", "柚子焼き", "Citrus grill", "鶏肉を使用"),
    ]);
    const search = createMenuSearch(configuration);
    expect(search("柚子　鶏肉").ids).toEqual([
      "tablecast-both",
      "tablecast-citrus",
      "tablecast-chicken",
    ]);
    expect(search("鶏肉 柚子").ids[0]).toBe("tablecast-both");
    expect(search("柚子 架空の料理").ids).toEqual(["tablecast-citrus", "tablecast-both"]);
  });

  it("1〜2文字の検索は誤字を許容せず通常の部分一致だけにする", () => {
    const search = createMenuSearch(
      menu([
        product("tablecast-red", "あか", "Red"),
        product("tablecast-blue", "あお", "Blue"),
        product("tablecast-single", "あ", "Single"),
      ]),
    );
    expect(search("あか").ids).toEqual(["tablecast-red"]);
    expect(search("あ").ids).toEqual(["tablecast-single"]);
    expect(search("か").ids).toEqual(["tablecast-red"]);
    expect(search("あき").ids).toEqual([]);
  });

  it("同じ関連度は登録順、空検索は全件、長い名前は途中で切り捨てない", () => {
    const configuration = menu([
      product("tablecast-first", "前菜盛り", "Starter"),
      product("tablecast-second", "前菜盛り", "Starter"),
    ]);
    const search = createMenuSearch(configuration);
    expect(search("前菜").ids).toEqual(["tablecast-first", "tablecast-second"]);
    expect(search("　 ").ids).toEqual(["tablecast-first", "tablecast-second"]);
    const longName = "季節の食材を使った前菜と温かい料理を少しずつ楽しむ特別なおまかせ盛り合わせ";
    configuration.products.push(
      configurationSchema.shape.products.element.parse(
        product("tablecast-long", longName, "Seasonal selection"),
      ),
    );
    expect(createMenuSearch(configuration)(longName).ids).toEqual(["tablecast-long"]);
  });

  it("カテゴリとプランにも同じ表記・説明文検索を使う", () => {
    const configuration = menu();
    configuration.categories[0]?.text.ja.aliases.push("フード");
    configuration.plans.push({
      id: "tablecast-plan",
      text: text("飲み放題", "Drinks plan", "ソフトドリンクも含む"),
      pricePerPerson: 2000,
      durationMinutes: 90,
      lastOrderMinutesBeforeEnd: 10,
      productIds: [],
      categoryIds: [],
      tags: [],
      maxPerOrder: 4,
      maxTotalPerPerson: 100,
      intervalSeconds: 0,
      excludedOptionIds: [],
      includedOptionSurcharge: true,
    });
    expect(createMenuSearch(configuration, "categories")("ふーど").ids).toEqual(["tablecast-food"]);
    expect(createMenuSearch(configuration, "plans")("そふとどりんく").ids).toEqual([
      "tablecast-plan",
    ]);
    expect(createMenuSearch(configuration)("ふーど")).toEqual({
      ids: ["tablecast-chicken", "tablecast-salad"],
      detail: false,
    });
  });
});

it("検索順のページ切出しは先頭・末尾・範囲外・0件を同じ規則で返す", () => {
  const configuration = menu();
  const ordered = createMenuSearch(configuration)("").ids;
  expect(menuSearchPage(configuration, { limit: 1 })).toMatchObject({
    productIds: ordered.slice(0, 1),
    offset: 0,
    total: ordered.length,
    more: true,
  });
  expect(menuSearchPage(configuration, { offset: ordered.length - 1, limit: 1 })).toMatchObject({
    productIds: ordered.slice(-1),
    more: false,
  });
  expect(menuSearchPage(configuration, { offset: ordered.length })).toMatchObject({
    productIds: [],
    total: ordered.length,
    more: false,
  });
  expect(menuSearchPage(configuration, { query: "zxqv未登録" })).toMatchObject({
    productIds: [],
    total: 0,
    more: false,
  });
});
