import { configurationErrors, priceCart } from "@tablecast/api/bootstrap";
import { resolveText } from "@tablecast/api/localization";
import { dietaryKeys, japaneseAllergenSchema } from "@tablecast/api/schema";
import { searchStoreSkills } from "@tablecast/api/store-knowledge";
import { describe, expect, it } from "vitest";
import { demoStores } from "./tablecast-fixtures.ts";

describe("デモの構成データ", () => {
  it("同じプロファイルから和食・バーガー・韓国料理店の4言語の102商品と個別写真を作る", () => {
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
  it.each(["demo", "history", "smoke"] as const)(
    "%sの全商品と具材に確認済みの食事情報を持つ",
    (profile) => {
      const products = demoStores(profile).flatMap((store) => store.configuration.products);
      expect(products.some((product) => !product.available)).toBe(profile !== "smoke");
      expect(products.some((product) => product.modifiers.some((group) => group.min > 0))).toBe(
        true,
      );
      for (const product of products) {
        const profiles = [
          product.foodInfo.base,
          ...product.foodInfo.components.map((item) => item.profile),
        ];
        for (const food of profiles) {
          expect(Object.keys(food.allergens).sort()).toEqual(
            [...japaneseAllergenSchema.options].sort(),
          );
          expect(
            Object.values(food.allergens).every((status) =>
              ["contains", "not_used"].includes(status),
            ),
          ).toBe(true);
          for (const key of dietaryKeys) {
            expect(["yes", "no"]).toContain(food.dietary[key].status);
            expect(food.dietary[key].reasons.length).toBeGreaterThan(0);
          }
          expect(food.halalCertification).toBe("not_certified");
          expect(food.crossContact).not.toBe("unknown");
          expect(food.crossContact === "controlled" || food.crossContactSources.length > 0).toBe(
            true,
          );
        }
      }
    },
  );
  it("魚・大麦・交換・追加・除去の食事対応と厨房の共用条件が選択後にも一致する", () => {
    const stores = demoStores("demo");
    const food = (productId: string, options: string[] = []) => {
      const store = stores.find((item) =>
        item.configuration.products.some((product) => product.id === productId),
      );
      if (!store) throw new Error(`商品がありません: ${productId}`);
      const result = priceCart(
        store.configuration,
        [
          {
            id: "tablecast-food-line",
            productId,
            quantity: 1,
            selections: options.map((optionId) => ({ optionId, quantity: 1 })),
          },
        ],
        1,
      );
      const information = result.lines[0]?.foodInformation;
      if (!information) throw new Error("選択後の食事情報がありません。");
      return information;
    };
    expect(food("tablecast-komorebi-tuna-sashimi")).toMatchObject({
      allergens: { wheat: "not_used", salmon: "not_used" },
      crossContact: "possible",
      dietary: {
        vegan: { status: "no" },
        vegetarian: { status: "no" },
        halal: { status: "yes" },
        glutenFree: { status: "yes" },
      },
    });
    expect(food("tablecast-hanul-sikhye").dietary.glutenFree.status).toBe("no");
    expect(food("tablecast-komorebi-beer").dietary.halal.reasons).toContain("alcohol");
    expect(
      food("tablecast-komorebi-shiitake", ["tablecast-komorebi-seasoning-tare"]).allergens.wheat,
    ).toBe("contains");
    expect(
      food("tablecast-komorebi-shiitake", ["tablecast-komorebi-seasoning-salt"]).allergens.wheat,
    ).toBe("not_used");
    expect(food("tablecast-komorebi-udon").dietary.vegetarian.status).toBe("no");
    expect(
      food("tablecast-komorebi-udon", ["tablecast-komorebi-broth-kombu"]).dietary.vegan.status,
    ).toBe("yes");
    expect(
      food("tablecast-komorebi-ochazuke", ["tablecast-komorebi-broth-kombu"]).dietary.vegan.status,
    ).toBe("no");
    expect(food("tablecast-komorebi-edamame").dietary.vegan.status).toBe("yes");
    expect(
      food("tablecast-hanul-bibimbap", [
        "tablecast-hanul-bibimbap-protein-tofu",
        "tablecast-hanul-egg-none",
      ]).dietary.vegan.status,
    ).toBe("yes");
    expect(food("tablecast-hanul-samgyeopsal").allergens.soya).toBe("contains");
    expect(
      food("tablecast-hanul-samgyeopsal", ["tablecast-hanul-ssamjang-none"]).allergens.soya,
    ).toBe("not_used");
    expect(
      food("tablecast-hanul-fried-chicken", ["tablecast-hanul-chicken-sauce-honey-mustard"])
        .allergens.egg,
    ).toBe("contains");
    expect(
      food("tablecast-koharu-westward-classic", [
        "tablecast-koharu-bun-lettuce",
        "tablecast-koharu-patty-plant",
        "tablecast-koharu-cheese-none",
        "tablecast-koharu-sauce-mustard",
      ]),
    ).toMatchObject({
      dietary: { vegan: { status: "yes" } },
      crossContact: "possible",
    });
    expect(food("tablecast-koharu-fries", ["tablecast-koharu-extras-bacon"])).toMatchObject({
      allergens: { pork: "contains" },
      dietary: { vegan: { status: "no" }, halal: { status: "no" } },
      crossContactSources: ["shared_equipment", "shared_frying_oil"],
    });
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
    const options = [...groups.values()].flatMap((group) => group.options);
    expect(options).toHaveLength(92);
    const pictured = options.filter((option) => option.imageKey);
    expect(pictured).toHaveLength(63);
    expect(new Set(pictured.map((option) => option.imageKey)).size).toBe(62);
    expect(pictured.every((option) => option.imageKey?.endsWith(".webp"))).toBe(true);
    expect(options.filter((option) => option.imageKey === null)).toHaveLength(29);
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
  it("smokeでも商品と対象外optionの参照を保ち12商品に絞る", () => {
    const stores = demoStores("smoke");
    expect(stores.reduce((sum, store) => sum + store.configuration.products.length, 0)).toBe(12);
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
