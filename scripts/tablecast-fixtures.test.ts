import { describe, expect, it } from "vitest";
import { demoStores } from "./tablecast-fixtures";
import { configurationErrors, priceCart } from "../apps/api/src/modules/catalog/pricing";

describe("デモの構成データ", () => {
  it("同じプロファイルから和食・バーガー・韓国料理店の日英102商品と個別写真を作る", () => {
    const stores = demoStores("demo");
    expect(stores).toEqual(demoStores("demo"));
    expect(new Set(stores.map((store) => store.id)).size).toBe(3);
    expect(stores.reduce((sum, store) => sum + store.configuration.products.length, 0)).toBe(102);
    expect(stores.reduce((sum, store) => sum + store.tableCount, 0)).toBe(36);
    const burgerProducts = stores
      .filter((store) => store.id === "tablecast-koharu")
      .flatMap((store) => store.configuration.products);
    expect(burgerProducts).toHaveLength(12);
    expect(burgerProducts.filter((product) => product.categoryId === "burgers")).toHaveLength(3);
    expect(burgerProducts.filter((product) => product.categoryId === "craft-beer")).toHaveLength(3);
    const allProducts = stores.flatMap((store) => store.configuration.products);
    expect(allProducts.every((product) => product.imageKey?.endsWith(".webp"))).toBe(true);
    expect(new Set(allProducts.map((product) => product.imageKey)).size).toBe(102);
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
        for (const locale of ["ja", "en"] as const) {
          expect(product.text[locale].speechName.length).toBeGreaterThan(0);
          expect(product.text[locale].description.length).toBeGreaterThan(0);
          expect(product.text[locale].aliases.length).toBeGreaterThan(0);
        }
      }
    }
  });
  it("未確認の原材料を安全と断定せず売切・必須選択の状態を含める", () => {
    const products = demoStores("demo").flatMap((store) => store.configuration.products);
    expect(products.some((product) => !product.available)).toBe(true);
    expect(products.some((product) => product.modifiers.some((group) => group.min > 0))).toBe(true);
    expect(
      products.every(
        (product) =>
          product.allergens.crossContact === "unknown" && product.allergens.vegan === "unknown",
      ),
    ).toBe(true);
    expect(
      products.some(
        (product) =>
          product.allergens.evidence === "verified" && product.allergens.contains.includes("fish"),
      ),
    ).toBe(true);
    expect(products.some((product) => product.allergens.evidence === "unknown")).toBe(true);
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
    expect(groups.size).toBe(30);
    expect([...groups.values()].reduce((sum, group) => sum + group.options.length, 0)).toBe(92);
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
  it("smokeでも商品と対象外optionの参照を保ち12商品に絞る", () => {
    const stores = demoStores("smoke");
    expect(stores.reduce((sum, store) => sum + store.configuration.products.length, 0)).toBe(12);
    for (const store of stores) expect(configurationErrors(store.configuration)).toEqual([]);
  });
});
