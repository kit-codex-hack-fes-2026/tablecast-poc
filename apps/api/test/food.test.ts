import { describe, expect, it } from "vitest";
import { productFoodErrors, productFoodInformation } from "../src/modules/catalog/food";
import { foodResultSchema } from "../src/modules/catalog/food-model";
import { readConfiguration } from "../src/modules/configuration/food-compatibility";
import { foodClassification, foodProfileSchema, unknownFoodProfile } from "../src/schema";
import { configuration } from "./configuration-fixture";
import { foodProduct, profile } from "./food-fixture";

describe("食事制限の集合とenumの判定理由", () => {
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
        dietary: { ...profile().dietary, halal: { status: "yes", reasons: [] } },
      }).success,
    ).toBe(false);
  });
  it("29品目外のアレルゲンと自由文の根拠・理由を入力として拒否する", () => {
    for (const id of ["mustard", "fish", "barley", "crustaceans", "molluscs"])
      expect(
        foodProfileSchema.safeParse({ ...profile(), allergens: { [id]: "contains" } }).success,
      ).toBe(false);
    expect(
      foodProfileSchema.safeParse({
        ...profile(),
        dietary: { ...profile().dietary, vegan: { status: "no", reasons: ["gluten_ingredients"] } },
      }).success,
    ).toBe(false);
    expect(
      foodProfileSchema.safeParse({
        ...profile(),
        dietary: { ...profile().dietary, halal: { status: "yes", reasons: ["alcohol"] } },
      }).success,
    ).toBe(false);
    expect(foodProfileSchema.safeParse({ ...profile(), otherAllergens: ["mustard"] }).success).toBe(
      false,
    );
    expect(
      foodProfileSchema.safeParse({ ...profile(), basis: { ja: "説明", en: "Description" } })
        .success,
    ).toBe(false);
    expect(
      foodProfileSchema.safeParse({
        ...profile(),
        dietary: { ...profile().dietary, halal: { status: "yes", reasons: ["arbitrary_reason"] } },
      }).success,
    ).toBe(false);
    expect(
      foodProfileSchema.safeParse({
        ...profile(),
        dietary: { ...profile().dietary, halal: { status: "yes", reasons: ["halal_certified"] } },
      }).success,
    ).toBe(false);
  });
  it("認証と共用設備・理由のenumを残った具材から合算する", () => {
    const product = foodProduct();
    product.foodInfo.base.halalCertification = "certified";
    const cheese = product.foodInfo.components.find((component) => component.id === "cheese");
    if (!cheese) throw new Error("具材がありません");
    cheese.profile.crossContact = "possible";
    cheese.profile.crossContactSources = ["shared_equipment"];
    const result = productFoodInformation(product, []);
    expect(result.crossContact).toBe("possible");
    expect(result.crossContactSources).toEqual(["shared_equipment"]);
    expect(result.halalCertification).toBe("unknown");
    expect(result.dietary.vegan.reasons).toEqual(["ingredients_confirmed"]);
    expect(
      productFoodInformation(product, [{ optionId: "no-cheese", quantity: 1 }]).crossContactSources,
    ).toEqual([]);
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
  it("過去snapshotの自由文から推測せず判定だけを読み取り、保存原本を変えない", () => {
    const assessment = { status: "no", basis: { ja: "旧文言", en: "Previous text" } };
    const previous = {
      allergens: { milk: "contains" },
      otherAllergens: ["mustard"],
      basis: { ja: "旧文言", en: "Previous text" },
      crossContact: "possible",
      dietary: {
        vegan: assessment,
        vegetarian: assessment,
        halal: assessment,
        glutenFree: assessment,
      },
    };
    const original = JSON.stringify(previous);
    const result = foodResultSchema.parse(previous);
    expect(result.allergens).toEqual({ milk: "contains" });
    expect(result.dietary.halal).toEqual({ status: "no", reasons: ["previous_record"] });
    expect(result.halalCertification).toBe("unknown");
    expect(result.crossContactSources).toEqual([]);
    expect(result).not.toHaveProperty("basis");
    expect(result).not.toHaveProperty("otherAllergens");
    expect(JSON.stringify(previous)).toBe(original);
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
    expect(converted?.foodInfo.base).not.toHaveProperty("otherAllergens");
    expect(converted?.foodInfo.base.dietary.vegan.status).toBe("no");
    expect(converted).not.toHaveProperty("allergens");
    expect(JSON.stringify(original)).toBe(json);
  });
});
