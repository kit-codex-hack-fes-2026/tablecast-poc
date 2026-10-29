import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  productFoodErrors,
  productFoodInformation,
  productOptionAllergens,
} from "../src/modules/catalog/food";
import { foodResultSchema } from "../src/modules/catalog/food-model";
import { readConfiguration } from "../src/modules/configuration/food-compatibility";
import {
  configurationSchema,
  foodClassification,
  foodProfileSchema,
  unknownFoodProfile,
} from "../src/schema";
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
  it("選択肢の注記は追加具材だけを合算し、除去対象や固定部分を含有として表示しない", () => {
    const product = foodProduct();
    const option = product.modifiers[0]?.options.find((item) => item.id === "extra-cheese");
    if (!option) throw new Error("選択肢がありません");
    option.foodChanges = { add: ["cheese", "bun"], remove: [] };
    expect(productOptionAllergens(product)).toMatchObject({
      "no-cheese": { contains: [], unverified: false },
      lettuce: { contains: [], unverified: false },
      "extra-cheese": { contains: ["wheat", "milk"], unverified: false },
    });
    option.foodChanges = undefined;
    expect(productOptionAllergens(product)[option.id]).toEqual({ contains: [], unverified: true });
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
            note: { ja: "乳と魚を登録", en: "Milk and fish recorded", fr: "Lait et poisson" },
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

describe("保存済みの商品名の読取互換", () => {
  it.each(["allergens", "foodInfo"] as const)(
    "%sの旧設定は未定義の転写だけ表示名で補い、追加言語と原本を保つ",
    (kind) => {
      const { foodInfo, ...product } = foodProduct();
      const original = {
        ...configuration,
        products: [
          {
            ...product,
            ...(kind === "foodInfo"
              ? { foodInfo }
              : {
                  allergens: {
                    contains: ["milk"],
                    evidence: "verified",
                    crossContact: "unknown",
                    vegan: "no",
                    note: { ja: "乳を登録", en: "Milk recorded" },
                  },
                }),
            text: {
              ja: { displayName: "旧商品名", speechName: "別の発音", transliteration: undefined },
              en: { displayName: "Previous name", speechName: "Different pronunciation" },
              ko: { displayName: "이전 이름" },
              fr: { displayName: "Ancien nom", transliteration: "Transcription conservée" },
            },
          },
        ],
      };
      const before = structuredClone(original);
      const converted = readConfiguration(original).products[0];
      expect(converted?.text.ja.transliteration).toBe("旧商品名");
      expect(converted?.text.en?.transliteration).toBe("Previous name");
      expect(converted?.text.ko?.transliteration).toBe("이전 이름");
      expect(converted?.text.fr?.transliteration).toBe("Transcription conservée");
      expect(converted?.text.ja.speechName).toBe("別の発音");
      expect(converted?.foodInfo).toMatchObject(
        kind === "foodInfo" ? foodInfo : { base: { allergens: { milk: "contains" } } },
      );
      expect(original).toStrictEqual(before);
      expect(configurationSchema.safeParse(original).success).toBe(false);
    },
  );
  it.each(["", "  ", null, 17, false, {}, []])(
    "明示された不正な転写%sを読取時にも拒否する",
    (transliteration) => {
      const product = foodProduct();
      const original = {
        ...configuration,
        products: [
          {
            ...product,
            text: { ...product.text, ja: { ...product.text.ja, transliteration } },
          },
        ],
      };
      const before = structuredClone(original);
      expect(() => readConfiguration(original)).toThrow(ZodError);
      expect(original).toStrictEqual(before);
      expect(configurationSchema.safeParse(original).success).toBe(false);
    },
  );
});
