import { expect, it } from "vitest";
import { configurationErrors, priceCart, type PlanContext } from "../src/modules/pricing";
import { configuration, text } from "./fixture";

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
it("登録されたプランだけで対象価格・人数上限・間隔・ラストオーダーを検証する", () => {
  expect(priceCart(configuration, tea, 0, plan, now).total).toBe(0);
  expect(() =>
    priceCart(configuration, tea, 0, { ...plan, startedAt: now - 80 * 60_000 }, now),
  ).toThrow("PLAN_LAST_ORDER");
  expect(() => priceCart(configuration, tea, 0, { ...plan, orderedQuantity: 19 }, now)).toThrow(
    "PLAN_TOTAL_LIMIT",
  );
  expect(() =>
    priceCart(configuration, tea, 0, { ...plan, lastOrderAt: now - 10000 }, now),
  ).toThrow("PLAN_INTERVAL");
  expect(() =>
    priceCart(
      configuration,
      [{ ...tea[0], id: "tea", productId: "tea", selections: [], quantity: 5 }],
      0,
      plan,
      now,
    ),
  ).toThrow("PLAN_ORDER_LIMIT");
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
  expect(configurationErrors(config)).toContain("dairy: 依存先が不正です");
});
