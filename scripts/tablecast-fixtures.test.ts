import { configurationErrors, priceCart } from "@tablecast/api/bootstrap";
import { resolveText } from "@tablecast/api/localization";
import { searchStoreSkills } from "@tablecast/api/store-knowledge";
import { describe, expect, it } from "vitest";
import { demoStores } from "./tablecast-fixtures.ts";

describe("デモの構成データ", () => {
  it("同じプロファイルから和食・バーガー・韓国料理・ラーメン店の4言語の110商品と画像を作る", () => {
    const stores = demoStores("demo");
    expect(stores).toEqual(demoStores("demo"));
    expect(new Set(stores.map((store) => store.id)).size).toBe(4);
    expect(stores.reduce((sum, store) => sum + store.configuration.products.length, 0)).toBe(110);
    expect(stores.reduce((sum, store) => sum + store.tableCount, 0)).toBe(46);
    const burgerProducts = stores
      .filter((store) => store.id === "tablecast-koharu")
      .flatMap((store) => store.configuration.products);
    expect(burgerProducts).toHaveLength(12);
    expect(burgerProducts.filter((product) => product.categoryId === "burgers")).toHaveLength(3);
    expect(burgerProducts.filter((product) => product.categoryId === "craft-beer")).toHaveLength(3);
    const allProducts = stores.flatMap((store) => store.configuration.products);
    expect(
      allProducts
        .filter((product) => product.imageKey)
        .every((product) => product.imageKey?.endsWith(".webp")),
    ).toBe(true);
    expect(allProducts.filter((product) => !product.imageKey).map((product) => product.id)).toEqual(
      ["tablecast-gomen-pork-takeaway"],
    );
    expect(
      new Set(allProducts.filter((product) => product.imageKey).map((product) => product.imageKey))
        .size,
    ).toBe(104);
    expect(stores.map((store) => store.id)).not.toContain("tablecast-akari");
    const koreanProducts =
      stores.find((store) => store.id === "tablecast-hanul")?.configuration.products ?? [];
    expect(koreanProducts).toHaveLength(30);
    expect(
      koreanProducts.filter((product) => product.categoryId === "korean-alcohol"),
    ).toHaveLength(5);
    expect(koreanProducts.filter((product) => product.categoryId === "soft-drinks")).toHaveLength(
      5,
    );
    expect(
      koreanProducts.find((product) => product.id.endsWith("-samgyeopsal"))?.text.ja.description,
    ).toContain("スタッフ");
    for (const store of stores.filter((item) => item.id === "tablecast-komorebi")) {
      const { products } = store.configuration;
      expect(products).toHaveLength(60);
      expect(products.filter((product) => product.categoryId === "sake")).toHaveLength(28);
      expect(products.filter((product) => product.categoryId === "drinks")).toHaveLength(8);
      expect(products.slice(0, 3).map((product) => product.categoryId)).toEqual([
        "sake",
        "sashimi",
        "fried",
      ]);
    }
    for (const store of stores) {
      expect(configurationErrors(store.configuration)).toEqual([]);
      const { products } = store.configuration;
      expect(products.some((product) => /small|sharing|coffee|latte/.test(product.id))).toBe(false);
      for (const product of products) {
        for (const language of ["ja", "en"])
          expect(resolveText(product.text, language).aliases.length).toBeGreaterThan(0);
        for (const locale of ["ja", "en", "zh-Hans", "ko"] as const) {
          expect(product.text[locale]?.transliteration?.trim()).toBeTruthy();
          expect(resolveText(product.text, locale).speechName.length).toBeGreaterThan(0);
          expect(resolveText(product.text, locale).description.length).toBeGreaterThan(0);
        }
      }
    }
  });
  it("未確認の原材料を安全と断定せず売切・必須選択の状態を含める", () => {
    const products = demoStores("demo").flatMap((store) => store.configuration.products);
    expect(products.some((product) => !product.available)).toBe(true);
    expect(products.some((product) => product.modifiers.some((group) => group.min > 0))).toBe(true);
    expect(products.some((product) => product.foodInfo.base.crossContact === "unknown")).toBe(true);
    expect(products.some((product) => product.foodInfo.base.allergens.salmon === "contains")).toBe(
      true,
    );
    expect(
      products.some((product) => product.foodInfo.base.dietary.vegan.status === "unknown"),
    ).toBe(true);
    expect(products.some((product) => product.foodInfo.base.dietary.vegan.status === "yes")).toBe(
      true,
    );
    expect(products.some((product) => product.foodInfo.base.dietary.halal.status === "no")).toBe(
      true,
    );
  });
  it("ラーメンの無料コールと有料追加を保持し、未選択・売切を注文可能にしない", () => {
    const store = demoStores("demo").find((item) => item.id === "tablecast-gomen");
    if (!store) throw new Error("ラーメン店がありません。");
    const line = {
      id: "ramen",
      productId: "tablecast-gomen-ramen-300",
      quantity: 1,
      selections: [
        { optionId: "tablecast-gomen-garlic-extra", quantity: 1 },
        { optionId: "tablecast-gomen-vegetables-double", quantity: 1 },
        { optionId: "tablecast-gomen-fat-none", quantity: 1 },
        { optionId: "tablecast-gomen-seasoning-regular", quantity: 1 },
        { optionId: "tablecast-gomen-extras-pork", quantity: 1 },
        { optionId: "tablecast-gomen-extras-egg", quantity: 1 },
      ],
    };
    expect(priceCart(store.configuration, [line], 1)).toMatchObject({
      complete: true,
      total: 1200,
    });
    expect(priceCart(store.configuration, [{ ...line, selections: [] }], 2).complete).toBe(false);
    expect(() =>
      priceCart(store.configuration, [{ ...line, productId: "tablecast-gomen-soupless-400" }], 3),
    ).toThrow("SOLD_OUT");
    expect(store.configuration.banners?.[0]?.hotspots[0]?.productId).toBe(line.productId);
    expect(store.configuration.appearance?.assets?.paper?.imageSource?.generated).toBe(true);
    expect(store.configuration.cast.instructions.ja).toContain("カラメは辛さではなく");
    expect(
      searchStoreSkills(store.configuration.cast.skills ?? [], "営業時間", 0).matches.length,
    ).toBeGreaterThan(0);
  });
  it("韓国店の台本で器三人分を一本分の酒とし、チヂミの訂正後は4740円になる", () => {
    const config = demoStores("demo").find(
      (store) => store.id === "tablecast-hanul",
    )?.configuration;
    if (!config) throw new Error("韓国店の構成がありません。");
    const lines = [
      {
        id: "grill",
        productId: "tablecast-hanul-samgyeopsal",
        quantity: 1,
        selections: [
          { optionId: "tablecast-hanul-wraps-mixed", quantity: 1 },
          { optionId: "tablecast-hanul-ssamjang-side", quantity: 1 },
        ],
      },
      {
        id: "pajeon",
        productId: "tablecast-hanul-seafood-pajeon",
        quantity: 2,
        selections: [{ optionId: "tablecast-hanul-dip-soy-vinegar", quantity: 1 }],
      },
      {
        id: "makgeolli",
        productId: "tablecast-hanul-rice-makgeolli",
        quantity: 1,
        selections: [{ optionId: "tablecast-hanul-glasses-three", quantity: 1 }],
      },
    ];
    expect(priceCart(config, lines, 1)).toMatchObject({ complete: true, total: 5820 });
    const corrected = lines.map((line) => (line.id === "pajeon" ? { ...line, quantity: 1 } : line));
    expect(priceCart(config, corrected, 2)).toMatchObject({ complete: true, total: 4740 });
  });
  it("温度・容量・薬味・バーガーの組立てを料理に応じた選択肢で表す", () => {
    const products = demoStores("demo").flatMap((store) => store.configuration.products);
    const groups = new Map(
      products.flatMap((product) => product.modifiers.map((group) => [group.id, group] as const)),
    );
    expect(groups.size).toBe(35);
    const options = [...groups.values()].flatMap((group) => group.options);
    expect(options).toHaveLength(109);
    const pictured = options.filter((option) => option.imageKey);
    expect(pictured).toHaveLength(63);
    expect(new Set(pictured.map((option) => option.imageKey)).size).toBe(62);
    expect(pictured.every((option) => option.imageKey?.endsWith(".webp"))).toBe(true);
    expect(options.filter((option) => option.imageKey === null)).toHaveLength(46);
    expect(options.every((option) => option.imageKind === "illustration")).toBe(true);
    expect(new Set([...groups.values()].map((group) => group.kind))).toEqual(
      new Set(["single", "multiple", "quantity"]),
    );
    for (const product of products) {
      for (const group of product.modifiers) {
        expect(group.id).not.toContain("milk");
      }
    }
    expect(
      products
        .filter((product) =>
          product.modifiers.some((group) => group.id === "tablecast-komorebi-temperature"),
        )
        .every((product) => product.categoryId === "sake"),
    ).toBe(true);
    expect(
      products
        .filter((product) => product.modifiers.some((group) => group.id.endsWith("-broth")))
        .every((product) => product.categoryId === "rice"),
    ).toBe(true);
    expect(
      products
        .filter((product) =>
          product.modifiers.some((group) => group.id === "tablecast-komorebi-ice"),
        )
        .every((product) => product.id.endsWith("-oolong") || product.id.endsWith("-green-tea")),
    ).toBe(true);
  });
  it("smokeでも商品と対象外optionの参照を保ち15商品に絞る", () => {
    const stores = demoStores("smoke");
    expect(stores.reduce((sum, store) => sum + store.configuration.products.length, 0)).toBe(15);
    for (const store of stores) expect(configurationErrors(store.configuration)).toEqual([]);
  });
});

it.each([
  ["営業時間", "references/visit.md", "17:00"],
  ["予約", "references/reservations.md", "予約"],
  ["wheelchairs", "references/facilities.md", "wheelchair"],
  ["receipts", "references/service.md", "receipt"],
  ["allergies", "references/dining.md", "allerg"],
  ["pairings", "references/sake.md", "pairing"],
  ["削除", "references/membership.md", "削除"],
])("こもれびの公開用資料から%sの根拠を取得できる", (query, path, text) => {
  const skills =
    demoStores("demo").find((store) => store.id === "tablecast-komorebi")?.configuration.cast
      .skills ?? [];
  const result = searchStoreSkills(skills, query, 0);
  expect(
    result.matches.some(
      (match) => match.path === path && match.excerpt.toLowerCase().includes(text.toLowerCase()),
    ),
  ).toBe(true);
});
