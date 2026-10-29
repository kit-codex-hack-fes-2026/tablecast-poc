import type { PlanContext } from "../src/modules/catalog/pricing";
import type { Configuration } from "../src/modules/configuration/model";
import type { Order, PricedLine } from "../src/modules/orders/model";
import type { buildPosInvoice } from "../src/modules/pos/invoice";
import { configuration, text } from "./configuration-fixture";

export const now = 1_800_000_000_000;
export const tea = [{ id: "tea-line", productId: "tea", quantity: 1, selections: [] }];
export const coffee = [
  {
    id: "coffee-line",
    productId: "coffee",
    quantity: 1,
    selections: [{ optionId: "oat", quantity: 1 }],
  },
];
export const plan: PlanContext = {
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

export function servedOrder(lines: PricedLine[], id = "tablecast-order"): Order {
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

export function invoiceInput(
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
    configurations: new Map([
      [
        1,
        {
          ...structuredClone(config),
          pos: {
            provider: "square",
            connectionId: "tablecast-pos-connection",
            mappings: [
              { kind: "product", localId: "tea", externalId: "square-tea" },
              { kind: "product", localId: "coffee", externalId: "square-coffee" },
              { kind: "option", localId: "oat", externalId: "square-oat" },
              { kind: "option", localId: "dairy", externalId: "square-dairy" },
            ],
          },
        },
      ],
    ]),
    connection: { id: "tablecast-pos-connection", provider: "square" },
    adjustments: [],
  };
}
