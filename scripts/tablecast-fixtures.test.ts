import { describe, expect, it } from "vitest";
import { demoStores } from "./tablecast-fixtures";
import { configurationErrors } from "../apps/api/src/modules/pricing";

describe("デモの構成データ", () => {
  it("同じプロファイルから店舗境界と日英を持つ同じ180商品を作る", () => {
    const stores = demoStores("demo");
    expect(stores).toEqual(demoStores("demo"));
    expect(new Set(stores.map((store) => store.organization)).size).toBe(2);
    expect(stores.reduce((sum, store) => sum + store.configuration.products.length, 0)).toBe(180);
    expect(stores.reduce((sum, store) => sum + store.tableCount, 0)).toBe(36);
    for (const store of stores) {
      expect(configurationErrors(store.configuration)).toEqual([]);
      const { products } = store.configuration;
      expect(products).toHaveLength(60);
      expect(products.filter((product) => product.categoryId === "sake")).toHaveLength(28);
      expect(products.filter((product) => product.categoryId === "drinks")).toHaveLength(8);
      expect(
        products.filter((product) => !["sake", "drinks"].includes(product.categoryId)),
      ).toHaveLength(24);
      expect(products.slice(0, 3).map((product) => product.categoryId)).toEqual([
        "sake",
        "sashimi",
        "fried",
      ]);
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
  it("温度・容量・薬味など料理に応じた24グループ96選択肢を持つ", () => {
    const products = demoStores("demo").flatMap((store) => store.configuration.products);
    const groups = new Map(
      products.flatMap((product) => product.modifiers.map((group) => [group.id, group] as const)),
    );
    expect(groups.size).toBe(24);
    expect([...groups.values()].reduce((sum, group) => sum + group.options.length, 0)).toBe(96);
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
        .filter((product) => product.modifiers.some((group) => group.id.endsWith("-temperature")))
        .every((product) => product.categoryId === "sake"),
    ).toBe(true);
    expect(
      products
        .filter((product) => product.modifiers.some((group) => group.id.endsWith("-broth")))
        .every((product) => product.categoryId === "rice"),
    ).toBe(true);
    expect(
      products
        .filter((product) => product.modifiers.some((group) => group.id.endsWith("-ice")))
        .every((product) => product.id.endsWith("-oolong") || product.id.endsWith("-green-tea")),
    ).toBe(true);
  });
  it("smokeでも商品と対象外optionの参照を保ち12商品に絞る", () => {
    const stores = demoStores("smoke");
    expect(stores.reduce((sum, store) => sum + store.configuration.products.length, 0)).toBe(12);
    for (const store of stores) expect(configurationErrors(store.configuration)).toEqual([]);
  });
});
