import type { ConfirmationRecord, EventRecord, OrderRecord, TableRecord } from "../../db/records";
import type { Catalog } from "../configuration/model";
import { DomainError } from "../../platform/errors";
import { type PlanContext, priceCart } from "../catalog/pricing";
import { menuSearchPage } from "../catalog/search";
import {
  type Bill,
  type Cart,
  type CartLine,
  cartLineSchema,
  inactiveOrderStatuses,
  type Order,
  type PlanUsage,
  snapshotSchema,
} from "../orders/model";
import {
  type CoreState,
  eventDataSchema,
  savedMenuSearchSchema,
  type TableEvent,
  tablePlanSchema,
  type TableState,
} from "./model";

export function orderValue(row: OrderRecord): Order {
  return {
    id: row.id,
    tableSessionId: row.table_session_id,
    snapshotId: row.snapshot_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    snapshot: snapshotSchema.parse(JSON.parse(row.snapshot_json)),
    total: row.total,
    createdAt: row.created_at,
  };
}

export function eventValue(row: EventRecord): TableEvent {
  return {
    cursor: row.cursor,
    storeId: row.store_id,
    tableSessionId: row.table_session_id,
    kind: row.kind,
    data: eventDataSchema.parse(JSON.parse(row.data_json)),
    createdAt: row.created_at,
  };
}

function previewCart(
  catalog: Catalog,
  lines: CartLine[],
  version: number,
  plan: null | PlanContext,
): Cart {
  try {
    return priceCart(catalog.configuration, lines, version, plan);
  } catch (error) {
    if (!(error instanceof DomainError)) throw error;
    const prices = lines.flatMap((line) => {
      try {
        return priceCart(catalog.configuration, [line], version).lines.map((priced) => ({
          ...priced,
          missing: [...priced.missing, error.code],
        }));
      } catch (lineError) {
        if (!(lineError instanceof DomainError)) throw lineError;
        const product = catalog.configuration.products.find((p) => p.id === line.productId);
        return [
          {
            ...line,
            name: {
              ja: product?.text.ja.displayName ?? "販売終了した商品",
              en: product?.text.en.displayName ?? "Unavailable item",
            },
            speechName: {
              ja: product?.text.ja.speechName ?? "商品",
              en: product?.text.en.speechName ?? "Item",
            },
            options: [],
            unitPrice: product?.price ?? 0,
            total: (product?.price ?? 0) * line.quantity,
            missing: [error.code],
            planCovered: false,
          },
        ];
      }
    });
    return {
      version,
      lines: prices,
      total: prices.reduce((sum, line) => sum + line.total, 0),
      complete: false,
    };
  }
}

export function billValue(
  totals: Omit<Bill, "due" | "planTotal">,
  plan: TableState["plan"],
  guestCount: number,
): Bill {
  const planTotal = plan ? plan.rules.pricePerPerson * guestCount : 0;
  return {
    ...totals,
    planTotal,
    due: totals.orderedTotal + totals.adjustmentTotal + planTotal - totals.paidTotal,
  };
}

export function tableStateValue(
  row: TableRecord,
  catalog: Catalog,
  table: TableSummary | undefined,
  orderRows: OrderRecord[],
  payments: PaymentTotal[],
  confirmation: ConfirmationRecord | undefined,
  history: EventRecord[],
): TableState {
  const orders = orderRows.map(orderValue);
  const plan = row.plan_json ? tablePlanSchema.parse(JSON.parse(row.plan_json)) : null;
  const usage = planContext(plan, row.guest_count, orders);
  return {
    ...coreStateValue(
      row,
      catalog,
      table,
      {
        orderedTotal: orders
          .filter((order) => !inactiveOrderStatuses.some((status) => status === order.status))
          .reduce((sum, order) => sum + order.total, 0),
        orderedQuantity: usage?.orderedQuantity ?? 0,
        lastOrderAt: usage?.lastOrderAt ?? null,
        summary: orderSummary(orders),
      },
      payments,
      confirmation,
      history.at(-1)?.cursor ?? 0,
    ),
    orders,
    events: history.map(eventValue),
  };
}

export function coreStateValue(
  row: TableRecord,
  catalog: Catalog,
  table: TableSummary | undefined,
  totals: OrderTotals,
  payments: PaymentTotal[],
  confirmation: ConfirmationRecord | undefined,
  cursor: number,
): CoreState {
  const plan = row.plan_json ? tablePlanSchema.parse(JSON.parse(row.plan_json)) : null;
  const cart = previewCart(
    catalog,
    cartLineSchema.array().parse(JSON.parse(row.cart_json)),
    row.cart_version,
    plan
      ? {
          ...plan,
          guestCount: row.guest_count,
          orderedQuantity: totals.orderedQuantity,
          lastOrderAt: totals.lastOrderAt,
        }
      : null,
  );
  const savedSearch = row.menu_search_json
    ? savedMenuSearchSchema.parse(JSON.parse(row.menu_search_json))
    : null;
  const searchPage = savedSearch
    ? menuSearchPage(catalog.configuration, {
        query: savedSearch.query,
        offset: savedSearch.configVersion === catalog.version ? savedSearch.offset : 0,
      })
    : null;
  const menuSearch =
    savedSearch && searchPage
      ? {
          query: savedSearch.query,
          offset: searchPage.offset,
          productIds: searchPage.productIds,
          total: searchPage.total,
          more: searchPage.more,
        }
      : null;
  const adjustmentTotal = payments.find((p) => p.kind === "adjustment")?.total ?? 0;
  const paidTotal = payments.find((p) => p.kind === "payment")?.total ?? 0;
  return {
    id: row.id,
    tableId: row.table_id,
    kind: row.kind,
    tableName: table?.name ?? (row.kind === "demo" ? "T1" : ""),
    storeId: row.store_id,
    storeName: catalog.storeName,
    configVersion: catalog.version,
    locale: row.locale,
    status: row.status,
    voiceState: row.voice_state,
    voiceSessionId: row.voice_session_id,
    uiSection: row.ui_section,
    menuSearch,
    selectedProductId:
      row.ui_section === "menu" &&
      catalog.configuration.products.some((product) => product.id === row.selected_product_id)
        ? row.selected_product_id
        : null,
    speechSpeed: row.speech_speed,
    guestCount: row.guest_count,
    openedAt: row.opened_at,
    cart,
    orderSummary: totals.summary,
    cursor,
    bill: billValue(
      { orderedTotal: totals.orderedTotal, adjustmentTotal, paidTotal, cartTotal: cart.total },
      plan,
      row.guest_count,
    ),
    billRequested: !!table?.bill_requested,
    plan,
    staffCalled: !!row.staff_called,
    snapshot:
      confirmation &&
      confirmation.config_version === catalog.version &&
      confirmation.cart_version === row.cart_version
        ? {
            ...snapshotSchema.parse(JSON.parse(confirmation.snapshot_json)),
            status: confirmation.status,
          }
        : null,
  };
}

export type OrderTotals = {
  lastOrderAt: null | number;
  orderedQuantity: number;
  orderedTotal: number;
  summary: CoreState["orderSummary"];
};

type PaymentTotal = { kind: string; table_session_id: string; total: null | number };

type TableSummary = { bill_requested: number; id: string; name: null | string };

function planContext(
  plan: TableState["plan"],
  guestCount: number,
  orders: readonly Pick<Order, "createdAt" | "snapshot" | "status">[],
): null | PlanContext {
  if (!plan) return null;
  let quantity = 0;
  let lastOrderAt: null | number = null;
  for (const order of orders) {
    if (inactiveOrderStatuses.some((status) => status === order.status)) continue;
    const covered = order.snapshot.lines
      .filter((line) => line.planCovered)
      .reduce((sum, line) => sum + line.quantity, 0);
    quantity += covered;
    if (covered) lastOrderAt = Math.max(lastOrderAt ?? 0, order.createdAt);
  }
  return { ...plan, guestCount, orderedQuantity: quantity, lastOrderAt };
}

export function planFromUsage(
  row: TableRecord,
  usage: null | PlanUsage | undefined,
): null | PlanContext {
  return row.plan_json
    ? {
        ...tablePlanSchema.parse(JSON.parse(row.plan_json)),
        guestCount: row.guest_count,
        orderedQuantity: usage?.quantity ?? 0,
        lastOrderAt: usage?.lastOrderAt ?? null,
      }
    : null;
}

function orderSummary(orders: Order[]): CoreState["orderSummary"] {
  const products = new Map<string, number>();
  let quantity = 0;
  for (const order of orders)
    for (const line of order.snapshot.lines) {
      quantity += line.quantity;
      products.set(line.productId, Math.max(products.get(line.productId) ?? 0, order.createdAt));
    }
  return {
    quantity,
    productIds: [...products]
      .toSorted(([a, at], [b, bt]) => bt - at || (a < b ? 1 : a > b ? -1 : 0))
      .slice(0, 3)
      .map(([id]) => id),
  };
}
