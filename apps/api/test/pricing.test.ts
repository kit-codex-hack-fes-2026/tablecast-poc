import { expect, it } from "vitest";
import { configurationErrors, priceCart, type PlanContext } from "../src/modules/pricing";
import { configurationIssueSchema } from "../src/schema";
import { configuration, text } from "./configuration-fixture";

const now = 1_800_000_000_000;
const plan: PlanContext = {
  id: "tablecast-plan",
  startedAt: now - 60_000,
  guestCount: 2,
  orderedQuantity: 0,
  lastOrderAt: null,
  rules: {
    id: "tablecast-plan",
    text: text("飲み放題", "Drinks plan"),
    pricePerPerson: 1800,
    durationMinutes: 90,
    lastOrderMinutesBeforeEnd: 10,
    productIds: [],
    categoryIds: ["drinks"],
    tags: [],
    maxPerOrder: 4,
    maxTotalPerPerson: 10,
    intervalSeconds: 30,
    excludedOptionIds: ["oat"],
    includedOptionSurcharge: true,
  },
};
const tea = [{ id: "tea-line", productId: "tea", quantity: 2, selections: [] }];
it("設定の業務不整合を翻訳可能なcode・正確なpath・型付きparamsで返す", () => {
  const config = structuredClone(configuration);
  const category = config.categories[0];
  const coffee = config.products[1];
  const group = coffee?.modifiers[0];
  const dairy = group?.options[0];
  if (!category || !coffee || !group || !dairy) throw new Error("設定fixtureがありません");
  config.categories.push(category);
  coffee.categoryId = "missing-category";
  group.min = 4;
  group.max = 3;
  dairy.requires = ["missing-option"];
  dairy.excludes = [dairy.id];
  config.plans = [
    {
      ...plan.rules,
      productIds: ["missing-product"],
      categoryIds: ["missing-category"],
      excludedOptionIds: ["missing-option"],
      lastOrderMinutesBeforeEnd: 90,
    },
    { ...plan.rules, id: "empty-plan", categoryIds: [], excludedOptionIds: [] },
  ];

  const errors = configurationErrors(config);
  expect(errors.map((error) => configurationIssueSchema.parse(error))).toEqual([
    { code: "DUPLICATE_ID", path: ["categories", 1, "id"], params: { id: "drinks" } },
    {
      code: "CATEGORY_NOT_FOUND",
      path: ["products", 1, "categoryId"],
      params: { categoryId: "missing-category" },
    },
    {
      code: "MODIFIER_SELECTION_RANGE",
      path: ["products", 1, "modifiers", 0, "max"],
      params: { min: 4, max: 3, kind: "single" },
    },
    {
      code: "MODIFIER_CAPACITY",
      path: ["products", 1, "modifiers", 0, "max"],
      params: { max: 3, capacity: 2 },
    },
    {
      code: "OPTION_REFERENCE_INVALID",
      path: ["products", 1, "modifiers", 0, "options", 0, "requires", 0],
      params: { optionId: "dairy", referenceId: "missing-option", relation: "requires" },
    },
    {
      code: "OPTION_REFERENCE_INVALID",
      path: ["products", 1, "modifiers", 0, "options", 0, "excludes", 0],
      params: { optionId: "dairy", referenceId: "dairy", relation: "excludes" },
    },
    {
      code: "PLAN_LAST_ORDER_INVALID",
      path: ["plans", 0, "lastOrderMinutesBeforeEnd"],
      params: { durationMinutes: 90, lastOrderMinutesBeforeEnd: 90 },
    },
    {
      code: "PRODUCT_NOT_FOUND",
      path: ["plans", 0, "productIds", 0],
      params: { productId: "missing-product" },
    },
    {
      code: "CATEGORY_NOT_FOUND",
      path: ["plans", 0, "categoryIds", 0],
      params: { categoryId: "missing-category" },
    },
    {
      code: "OPTION_NOT_FOUND",
      path: ["plans", 0, "excludedOptionIds", 0],
      params: { optionId: "missing-option" },
    },
    { code: "PLAN_TARGET_EMPTY", path: ["plans", 1], params: {} },
  ]);
});

it("商品内でグループをまたぐ選択肢ID重複を該当箇所へ返す", () => {
  const config = structuredClone(configuration);
  const coffee = config.products[1];
  const group = coffee?.modifiers[0];
  if (!coffee || !group) throw new Error("選択肢fixtureがありません");
  coffee.modifiers.push({ ...group, id: "second-milk" });

  expect(configurationErrors(config)).toEqual([
    {
      code: "DUPLICATE_ID",
      path: ["products", 1, "modifiers", 1, "options", 0, "id"],
      params: { id: "dairy" },
    },
    {
      code: "DUPLICATE_ID",
      path: ["products", 1, "modifiers", 1, "options", 1, "id"],
      params: { id: "oat" },
    },
  ]);
});

it("登録されたプランの対象商品を追加料金なしで計算する", () => {
  expect(priceCart(configuration, tea, 0, plan, now).total).toBe(0);
});
const planBoundaries = [
  { name: "ラストオーダー直前", patch: { startedAt: now - 80 * 60_000 + 1 }, error: null },
  { name: "ラストオーダー到達", patch: { startedAt: now - 80 * 60_000 }, error: "PLAN_LAST_ORDER" },
  {
    name: "ラストオーダー超過",
    patch: { startedAt: now - 80 * 60_000 - 1 },
    error: "PLAN_LAST_ORDER",
  },
  { name: "人数上限到達", patch: { orderedQuantity: 18 }, error: null },
  { name: "人数上限超過", patch: { orderedQuantity: 19 }, error: "PLAN_TOTAL_LIMIT" },
  { name: "間隔の直前", patch: { lastOrderAt: now - 30000 + 1 }, error: "PLAN_INTERVAL" },
  { name: "間隔の到達", patch: { lastOrderAt: now - 30000 }, error: null },
  { name: "間隔の超過", patch: { lastOrderAt: now - 30000 - 1 }, error: null },
];
it.each(planBoundaries.filter((row) => row.error === null))(
  "$nameではプラン注文を受け付ける",
  ({ patch }) => {
    expect(priceCart(configuration, tea, 0, { ...plan, ...patch }, now).complete).toBe(true);
  },
);
it.each(planBoundaries.filter((row) => row.error !== null))(
  "$nameではプラン注文を拒否する",
  ({ patch, error }) => {
    expect(() => priceCart(configuration, tea, 0, { ...plan, ...patch }, now)).toThrow(
      error ?? undefined,
    );
  },
);
it.each([3, 4])("一回の数量%iは上限4以下なので受け付ける", (quantity) => {
  expect(
    priceCart(
      configuration,
      [{ id: "tea", productId: "tea", selections: [], quantity }],
      0,
      plan,
      now,
    ).total,
  ).toBe(0);
});
it("一回の数量5は上限4を超えるので拒否する", () => {
  expect(() =>
    priceCart(
      configuration,
      [{ id: "tea", productId: "tea", selections: [], quantity: 5 }],
      0,
      plan,
      now,
    ),
  ).toThrow("PLAN_ORDER_LIMIT");
});
it("除外されたオプションをプラン注文に含められない", () => {
  expect(() =>
    priceCart(
      configuration,
      [
        {
          id: "coffee",
          productId: "coffee",
          quantity: 1,
          selections: [{ optionId: "oat", quantity: 1 }],
        },
      ],
      0,
      plan,
      now,
    ),
  ).toThrow("PLAN_OPTION_EXCLUDED");
});
it("選択肢IDで組合せ禁止と依存不足を検出し、重複した選択肢を拒否する", () => {
  const config = structuredClone(configuration);
  const coffee = config.products.find((p) => p.id === "coffee");
  if (!coffee) throw new Error("fixtureの商品がありません");
  const milk = coffee.modifiers[0];
  if (!milk) throw new Error("fixtureの選択肢がありません");
  milk.kind = "multiple";
  milk.max = 2;
  const dairy = milk.options.find((o) => o.id === "dairy");
  if (!dairy) throw new Error("fixtureの牛乳がありません");
  dairy.excludes = ["oat"];
  expect(() =>
    priceCart(
      config,
      [
        {
          id: "coffee",
          productId: "coffee",
          quantity: 1,
          selections: [
            { optionId: "dairy", quantity: 1 },
            { optionId: "oat", quantity: 1 },
          ],
        },
      ],
      0,
    ),
  ).toThrow("OPTION_COMBINATION");
  dairy.excludes = [];
  dairy.requires = ["oat"];
  expect(
    priceCart(
      config,
      [
        {
          id: "coffee",
          productId: "coffee",
          quantity: 1,
          selections: [{ optionId: "dairy", quantity: 1 }],
        },
      ],
      0,
    ).complete,
  ).toBe(false);
  expect(() =>
    priceCart(
      config,
      [
        {
          id: "coffee",
          productId: "coffee",
          quantity: 1,
          selections: [
            { optionId: "oat", quantity: 1 },
            { optionId: "oat", quantity: 1 },
          ],
        },
      ],
      0,
    ),
  ).toThrow("DUPLICATE_OPTION");
  dairy.requires = ["not-registered"];
  expect(configurationErrors(config)).toContainEqual({
    code: "OPTION_REFERENCE_INVALID",
    path: ["products", 1, "modifiers", 0, "options", 0, "requires", 0],
    params: { optionId: "dairy", referenceId: "not-registered", relation: "requires" },
  });
});
