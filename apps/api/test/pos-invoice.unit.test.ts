import { expect, it } from "vitest";
import type { Configuration } from "../src/modules/configuration/model";
import type { Order, PricedLine } from "../src/modules/orders/model";
import { type PlanContext, priceCart } from "../src/modules/catalog/pricing";
import { buildPosInvoice } from "../src/modules/pos/invoice";
import { posInvoiceSchema } from "../src/modules/pos/model";
import { configuration, text } from "./configuration-fixture";

const now = 1_800_000_000_000;
const tea = [{ id: "tea-line", productId: "tea", quantity: 1, selections: [] }];
const coffee = [
  {
    id: "coffee-line",
    productId: "coffee",
    quantity: 1,
    selections: [{ optionId: "oat", quantity: 1 }],
  },
];
const plan: PlanContext = {
  id: "tablecast-plan",
  guestCount: 2,
  startedAt: now - 60_000,
  orderedQuantity: 0,
  lastOrderAt: null,
  rules: {
    id: "tablecast-plan",
    text: text("飲み放題", "Drinks plan"),
    pricePerPerson: 3000,
    durationMinutes: 90,
    lastOrderMinutesBeforeEnd: 10,
    productIds: ["coffee"],
    categoryIds: [],
    tags: [],
    maxPerOrder: 4,
    maxTotalPerPerson: 10,
    intervalSeconds: 0,
    excludedOptionIds: [],
    includedOptionSurcharge: true,
  },
};

function servedOrder(lines: PricedLine[], id = "tablecast-order"): Order {
  const snapshotId = `${id}-snapshot`;
  const total = lines.reduce((sum, line) => sum + line.total, 0);
  return {
    id,
    tableSessionId: "tablecast-session",
    snapshotId,
    idempotencyKey: `${id}-key`,
    status: "served",
    total,
    createdAt: now,
    snapshot: {
      id: snapshotId,
      tableSessionId: "tablecast-session",
      cartVersion: 1,
      configVersion: 1,
      lines,
      total,
      locale: "ja",
      text: "承認済みの注文",
      expiresAt: now + 60_000,
      channel: "gui",
      status: "submitted",
      createdTurnId: null,
      plan: null,
    },
  };
}

function invoiceInput(
  orders: Order[],
  config: Configuration = configuration,
): Parameters<typeof buildPosInvoice>[0] {
  const orderedTotal = orders
    .filter((order) => order.status !== "cancelled" && order.status !== "rejected")
    .reduce((sum, order) => sum + order.total, 0);
  return {
    table: {
      id: "tablecast-session",
      storeId: "tablecast-store",
      cart: { version: 7, lines: [], total: 0, complete: false },
      bill: {
        orderedTotal,
        adjustmentTotal: 0,
        paidTotal: 0,
        due: orderedTotal,
        cartTotal: 0,
        planTotal: 0,
      },
      plan: null,
      guestCount: 2,
      locale: "ja",
      status: "open",
    },
    orders,
    configurations: new Map([[1, structuredClone(config)]]),
    mappings: [
      { kind: "product", localId: "tea", externalId: "square-tea" },
      { kind: "product", localId: "coffee", externalId: "square-coffee" },
      { kind: "option", localId: "oat", externalId: "square-oat" },
      { kind: "option", localId: "dairy", externalId: "square-dairy" },
    ],
    adjustments: [],
  };
}

it("人数料金・プラン内商品・有料オプション・対象外商品と割引調整を6,600円にまとめる", () => {
  const cart = priceCart(
    configuration,
    [...coffee, ...tea].map((line) => ({ ...line, quantity: 2 })),
    1,
    plan,
    now,
  );
  const input = invoiceInput([servedOrder(cart.lines)]);
  input.table.plan = plan;
  input.table.bill = {
    orderedTotal: 1000,
    adjustmentTotal: -400,
    paidTotal: 0,
    due: 6600,
    cartTotal: 0,
    planTotal: 6000,
  };
  input.adjustments = [
    { id: "coupon-use", amount: -500, reason: "クーポン" },
    { id: "manual-adjustment", amount: 100, reason: "会計調整" },
  ];

  const result = buildPosInvoice(input);

  expect(result.issues).toEqual([]);
  expect(posInvoiceSchema.parse(result.invoice)).toEqual(result.invoice);
  expect(result.invoice).toMatchObject({
    id: "tablecast-session",
    sessionId: "tablecast-session",
    storeId: "tablecast-store",
    version: 7,
    currency: "JPY",
    total: 6600,
  });
  expect(result.invoice.lines).toEqual([
    expect.objectContaining({
      id: "tablecast-order:coffee-line",
      productId: "coffee",
      displayName: { ja: "カフェラテ", en: "Caffè latte" },
      quantity: 2,
      unitPrice: 0,
      referencePrice: 500,
      total: 200,
      options: [
        {
          id: "oat",
          externalId: "square-oat",
          name: "オーツミルク",
          displayName: { ja: "オーツミルク", en: "Oat milk" },
          quantity: 1,
          price: 100,
          referencePrice: 100,
        },
      ],
    }),
    expect.objectContaining({
      id: "tablecast-order:tea-line",
      productId: "tea",
      displayName: { ja: "ほうじ茶", en: "Roasted green tea" },
      quantity: 2,
      unitPrice: 400,
      referencePrice: 400,
      total: 800,
    }),
    {
      id: "plan:tablecast-plan",
      productId: null,
      externalId: null,
      name: "飲み放題",
      displayName: { ja: "飲み放題", en: "Drinks plan" },
      quantity: 2,
      unitPrice: 3000,
      referencePrice: 3000,
      total: 6000,
      options: [],
    },
  ]);
  expect(result.invoice.adjustments).toEqual([
    { id: "coupon-use", name: "クーポン", amount: -500 },
    { id: "manual-adjustment", name: "会計調整", amount: 100 },
  ]);
});

it("全額割引で0円になっても空会計として拒否せずクーポンを一度だけ計上する", () => {
  const input = invoiceInput([servedOrder(priceCart(configuration, tea, 1).lines)]);
  input.adjustments = [{ id: "coupon-use", amount: -400, reason: "全額割引" }];
  input.table.bill.adjustmentTotal = -400;
  input.table.bill.due = 0;

  const result = buildPosInvoice(input);

  expect(result.issues).toEqual([]);
  expect(result.invoice.total).toBe(0);
  expect(result.invoice.lines).toHaveLength(1);
  expect(result.invoice.adjustments).toEqual([
    { id: "coupon-use", name: "全額割引", amount: -400 },
  ]);
});

it("現行価格が変わっても注文時の設定版から通常価格を参照する", () => {
  const input = invoiceInput([servedOrder(priceCart(configuration, tea, 1).lines)]);
  const current = structuredClone(configuration);
  const product = current.products.find((item) => item.id === "tea");
  if (!product) throw new Error("商品fixtureがありません");
  product.price = 900;
  product.text = text("新しいお茶", "New tea");
  input.configurations.set(2, current);

  const result = buildPosInvoice(input);

  expect(result.issues).toEqual([]);
  expect(result.invoice.lines).toMatchObject([
    { name: "ほうじ茶", unitPrice: 400, referencePrice: 400, total: 400 },
  ]);
  expect(result.invoice.total).toBe(400);
  input.configurations.delete(1);
  expect(() => buildPosInvoice(input)).toThrow("POS_INVALID_INPUT");
});

it("負のオプションを基本価格から分離し金額と符号を保持する", () => {
  const config = structuredClone(configuration);
  const option = config.products
    .find((item) => item.id === "coffee")
    ?.modifiers[0]?.options.find((item) => item.id === "oat");
  if (!option) throw new Error("オプションfixtureがありません");
  option.priceDelta = -100;
  const input = invoiceInput([servedOrder(priceCart(config, coffee, 1).lines)], config);

  const result = buildPosInvoice(input);

  expect(result.issues).toEqual([]);
  expect(result.invoice.lines).toMatchObject([
    {
      unitPrice: 500,
      referencePrice: 500,
      total: 400,
      options: [{ price: -100, referencePrice: -100 }],
    },
  ]);
  expect(result.invoice.total).toBe(400);
});

it("オプション込みのプランでは承認済みの0円を保ち登録追加料金だけを照合用に残す", () => {
  const includedPlan = structuredClone(plan);
  includedPlan.rules.includedOptionSurcharge = false;
  const input = invoiceInput([
    servedOrder(priceCart(configuration, coffee, 1, includedPlan, now).lines),
  ]);
  input.table.plan = includedPlan;
  input.table.locale = "en";
  input.table.bill.planTotal = 6000;
  input.table.bill.due = 6000;

  const result = buildPosInvoice(input);

  expect(result.issues).toEqual([]);
  expect(result.invoice.lines).toMatchObject([
    { name: "Caffè latte", unitPrice: 0, total: 0, options: [{ price: 0, referencePrice: 100 }] },
    { name: "Drinks plan", total: 6000 },
  ]);
});

it.each([
  { status: "submitted", pending: true, count: 1 },
  { status: "accepted", pending: true, count: 1 },
  { status: "served", pending: false, count: 1 },
  { status: "cancelled", pending: false, count: 0 },
  { status: "rejected", pending: false, count: 0 },
] satisfies { count: number; pending: boolean; status: Order["status"] }[])(
  "$statusの注文を会計条件へ反映する",
  ({ status, pending, count }) => {
    const order = servedOrder(priceCart(configuration, tea, 1).lines);
    order.status = status;
    const input = invoiceInput([order]);

    const result = buildPosInvoice(input);

    expect(result.invoice.lines).toHaveLength(count);
    expect(result.issues.some((issue) => issue.code === "POS_ORDERS_PENDING")).toBe(pending);
    expect(result.invoice.total).toBe(count * 400);
  },
);

it("未送信カートは請求明細へ足さず開始不可の理由を返す", () => {
  const input = invoiceInput([servedOrder(priceCart(configuration, tea, 1).lines)]);
  input.table.cart = priceCart(configuration, coffee, 7);

  const result = buildPosInvoice(input);

  expect(result.issues).toContainEqual({ code: "POS_CART_NOT_EMPTY" });
  expect(result.invoice.lines).toHaveLength(1);
  expect(result.invoice.total).toBe(400);
});

it("支払済み・閉卓を理由付きで止める", () => {
  const input = invoiceInput([servedOrder(priceCart(configuration, tea, 1).lines)]);
  input.table.bill.paidTotal = 400;
  input.table.bill.due = 0;
  input.table.status = "closed";

  const result = buildPosInvoice(input);

  expect(result.issues).toContainEqual({ code: "POS_ALREADY_PAID" });
  expect(result.issues).toContainEqual({ code: "POS_SESSION_CLOSED" });
});

it("商品とオプションの対応付け不足を元のIDと名前付きで返す", () => {
  const input = invoiceInput([servedOrder(priceCart(configuration, coffee, 1).lines)]);
  input.mappings = [];

  const result = buildPosInvoice(input);

  expect(result.issues).toEqual([
    { code: "POS_MAPPING_REQUIRED", localId: "coffee", name: "カフェラテ" },
    { code: "POS_MAPPING_REQUIRED", localId: "oat", name: "オーツミルク" },
  ]);
  expect(result.invoice.lines).toMatchObject([
    { externalId: null, options: [{ externalId: null }] },
  ]);
});

it("既存会計と明細総和が1円違っても不一致として止める", () => {
  const input = invoiceInput([servedOrder(priceCart(configuration, tea, 1).lines)]);
  input.table.bill.due++;

  expect(buildPosInvoice(input).issues).toEqual([
    { code: "POS_TOTAL_MISMATCH", expected: 400, actual: 401 },
  ]);
});

it("明細も調整もない0円会計を開始しない", () => {
  expect(buildPosInvoice(invoiceInput([])).issues).toEqual([{ code: "POS_ZERO_OR_EMPTY" }]);
});

it.each([500, 501])("%i明細を切り捨てず上限500件を判定する", (count) => {
  const line = priceCart(configuration, tea, 1).lines;
  const input = invoiceInput(
    Array.from({ length: count }, (_, index) => servedOrder(line, `tablecast-order-${index}`)),
  );

  const result = buildPosInvoice(input);

  expect(result.invoice.lines).toHaveLength(count);
  expect(result.invoice.total).toBe(count * 400);
  expect(result.issues).toEqual(count === 500 ? [] : [{ code: "POS_UNSUPPORTED" }]);
});

it("同じローカルIDの二重対応付けを選択せず拒否する", () => {
  const input = invoiceInput([servedOrder(priceCart(configuration, tea, 1).lines)]);
  input.mappings.push({ kind: "product", localId: "tea", externalId: "square-another-tea" });

  expect(() => buildPosInvoice(input)).toThrow("POS_INVALID_INPUT");
});

it("注文時の設定内で商品IDが衝突したら拒否する", () => {
  const config = structuredClone(configuration);
  const product = config.products.find((item) => item.id === "tea");
  if (!product) throw new Error("商品fixtureがありません");
  config.products.push({ ...product, price: 900 });
  const input = invoiceInput([servedOrder(priceCart(configuration, tea, 1).lines)], config);

  expect(() => buildPosInvoice(input)).toThrow("POS_INVALID_INPUT");
});

it("同じ商品のオプションIDが衝突したら拒否する", () => {
  const config = structuredClone(configuration);
  const modifier = config.products.find((item) => item.id === "coffee")?.modifiers[0];
  const option = modifier?.options[0];
  if (!modifier || !option) throw new Error("オプションfixtureがありません");
  modifier.options.push({ ...option, priceDelta: 50 });
  const input = invoiceInput([servedOrder(priceCart(configuration, coffee, 1).lines)], config);

  expect(() => buildPosInvoice(input)).toThrow("POS_INVALID_INPUT");
});

it("別来店の注文を混ぜた入力を拒否する", () => {
  const order = servedOrder(priceCart(configuration, tea, 1).lines);
  order.tableSessionId = "tablecast-other-session";

  expect(() => buildPosInvoice(invoiceInput([order]))).toThrow("POS_INVALID_INPUT");
});

it("注文IDと明細IDの連結で同じ外部明細IDになる入力を拒否する", () => {
  const first = servedOrder(
    priceCart(configuration, [{ id: "line", productId: "tea", quantity: 1, selections: [] }], 1)
      .lines,
    "order:first",
  );
  const second = servedOrder(
    priceCart(
      configuration,
      [{ id: "first:line", productId: "tea", quantity: 1, selections: [] }],
      1,
    ).lines,
    "order",
  );

  expect(() => buildPosInvoice(invoiceInput([first, second]))).toThrow("POS_INVALID_INPUT");
});
