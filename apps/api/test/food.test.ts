import { describe, expect, it } from "vitest";
import { productFoodErrors, productFoodInformation } from "../src/modules/catalog/food";
import { readConfiguration } from "../src/modules/configuration/food-compatibility";
import { foodClassification, foodProfileSchema, unknownFoodProfile } from "../src/schema";
import { configuration } from "./configuration-fixture";
import { foodProduct, profile } from "./food-fixture";

describe("食事制限の集合と登録根拠", () => {
  it("日本の9品目と20品目を区別し、カシューナッツとピスタチオを現行区分に置く", () => {
    expect(
      foodClassification.allergens.filter((item) => item.category === "required"),
    ).toHaveLength(9);
    expect(
      foodClassification.allergens.filter((item) => item.category === "recommended"),
    ).toHaveLength(20);
    expect(foodClassification.allergens.find((item) => item.id === "cashew")?.category).toBe(
      "required",
    );
    expect(foodClassification.allergens.find((item) => item.id === "pistachio")?.category).toBe(
      "recommended",
    );
  });
  it("チーズを抜いてもバンズ由来の乳が残り、両方を除去したときだけ不使用になる", () => {
    const product = foodProduct();
    expect(
      productFoodInformation(product, [{ optionId: "no-cheese", quantity: 1 }]).allergens.milk,
    ).toBe("contains");
    expect(
      productFoodInformation(product, [
        { optionId: "no-cheese", quantity: 1 },
        { optionId: "lettuce", quantity: 1 },
      ]).allergens.milk,
    ).toBe("not_used");
  });
  it("追加は除去に優先し、選択の順序と重複数量で定性的な判定を変えない", () => {
    const product = foodProduct();
    const selections = [
      { optionId: "no-cheese", quantity: 1 },
      { optionId: "lettuce", quantity: 1 },
      { optionId: "extra-cheese", quantity: 1 },
    ];
    const result = productFoodInformation(product, selections);
    expect(result.allergens.milk).toBe("contains");
    expect(result.dietary.vegan.status).toBe("no");
    expect(
      productFoodInformation(
        product,
        selections.toReversed().map((item) => ({ ...item, quantity: 2 })),
      ),
    ).toEqual(result);
    expect(foodProfileSchema.safeParse(product.foodInfo.base).success).toBe(true);
  });
  it("未登録や調理条件の不明を残し、小麦不使用からグルテンフリーを推定しない", () => {
    const product = foodProduct();
    product.foodInfo.base = unknownFoodProfile();
    const result = productFoodInformation(product, [
      { optionId: "no-cheese", quantity: 1 },
      { optionId: "lettuce", quantity: 1 },
    ]);
    expect(result.allergens.wheat ?? "unknown").toBe("unknown");
    expect(result.dietary.glutenFree.status).toBe("unknown");
    expect(result.crossContact).toBe("unknown");
    product.foodInfo.base.crossContact = "possible";
    expect(productFoodInformation(product, []).crossContact).toBe("possible");
    expect(
      foodProfileSchema.safeParse({
        ...profile(),
        dietary: { ...profile().dietary, halal: { status: "yes", basis: { ja: "", en: "" } } },
      }).success,
    ).toBe(false);
  });
  it("具材の重複、参照切れ、同じ選択肢での追加と除去を検出する", () => {
    const product = foodProduct();
    const component = product.foodInfo.components[0];
    const option = product.modifiers[0]?.options[0];
    if (!component || !option) throw new Error("具材fixtureがありません");
    product.foodInfo.components.push(component);
    product.foodInfo.defaultComponentIds.push("missing");
    option.foodChanges = { add: ["cheese"], remove: ["cheese"] };
    expect(productFoodErrors(product)).toHaveLength(3);
  });
  it("旧記録を固定部分へ移し、未記載品目を不使用とせず元のJSONを保持する", () => {
    const { foodInfo: _foodInfo, ...product } = foodProduct();
    const original = {
      ...configuration,
      products: [
        {
          ...product,
          allergens: {
            contains: ["milk", "fish"],
            evidence: "verified",
            crossContact: "unknown",
            vegan: "no",
            note: { ja: "乳と魚を登録", en: "Milk and fish recorded" },
          },
        },
      ],
    };
    for (const item of original.products) item.modifiers = [];
    const json = JSON.stringify(original);
    const converted = readConfiguration(original).products[0];
    expect(converted?.foodInfo.base.allergens).toEqual({ milk: "contains" });
    expect(converted?.foodInfo.base.otherAllergens).toEqual(["fish"]);
    expect(converted?.foodInfo.base.dietary.vegan.status).toBe("no");
    expect(converted).not.toHaveProperty("allergens");
    expect(JSON.stringify(original)).toBe(json);
  });
});
