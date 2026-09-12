import { observeOperation } from "../../platform/telemetry";
import { and, desc, eq, exists, gt, inArray, sum as sumAmount } from "drizzle-orm";
import * as business from "../../db/business-schema";
import type { ConfirmationRecord, EventRecord, OrderRecord, TableRecord } from "../../db/records";
import type { ApiServices } from "../../platform/context";
import { DomainError, ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { priceCart, type PlanContext } from "../catalog/pricing";
import { getDemoRecord } from "../demo/queries";
import { catalogQuery, catalogValue, getCatalog } from "../catalog/queries";
import type { Catalog } from "../configuration/model";
import {
  cartLineSchema,
  snapshotSchema,
  type Bill,
  type Cart,
  type CartLine,
  type Order,
} from "../orders/model";
import { eventDataSchema, tablePlanSchema, type TableEvent, type TableState } from "./model";
export async function getSession(services: ApiServices, actor: Actor): Promise<TableRecord> {
  const db = services.db;

  ensure(actor.tableSessionId, "TABLE_REQUIRED", 403);
  const row = await db
    .select()
    .from(business.tableSessions)
    .where(
      and(
        eq(business.tableSessions.id, actor.tableSessionId),
        eq(business.tableSessions.store_id, actor.storeId),
      ),
    )
    .get();
  return validateSession(services, actor, row);
}

export async function validateSession(
  services: ApiServices,
  actor: Actor,
  row: TableRecord | undefined,
): Promise<TableRecord> {
  ensure(row, "TABLE_NOT_FOUND", 404);
  if (row.kind === "demo") {
    await getDemoRecord(services, actor);
  } else ensure(!actor.demoId, "DEMO_NOT_FOUND", 404);
  if (actor.kind === "device") ensure(row.status === "open", "SESSION_CLOSED", 403);
  if (actor.kind === "voice")
    ensure(
      row.status === "open" &&
        row.voice_state === "active" &&
        row.voice_session_id === actor.voiceSessionId &&
        (!actor.turnId || row.active_turn_id === actor.turnId),
      "VOICE_SESSION_STALE",
      409,
    );
  return row;
}

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

export async function getPricingContext(
  services: ApiServices,
  row: TableRecord,
): Promise<{ catalog: Catalog; plan: PlanContext | null }> {
  const demoId = row.kind === "demo" ? row.id : undefined;
  if (!row.plan_json)
    return { catalog: await getCatalog(services, row.store_id, demoId), plan: null };
  const db = services.db;
  const [catalogs, orders] = await db.batch([
    catalogQuery(db, row.store_id, demoId),
    db
      .select()
      .from(business.orders)
      .where(
        and(
          eq(business.orders.table_session_id, row.id),
          eq(business.orders.store_id, row.store_id),
        ),
      ),
  ]);
  return { catalog: catalogValue(catalogs[0], demoId), plan: planFromOrders(row, orders) };
}

export function planFromOrders(row: TableRecord, orders: OrderRecord[]): PlanContext | null {
  if (!row.plan_json) return null;
  const plan = tablePlanSchema.parse(JSON.parse(row.plan_json));
  let quantity = 0;
  let lastOrderAt: number | null = null;
  for (const order of orders) {
    if (order.status === "cancelled" || order.status === "rejected") continue;
    const snapshot = snapshotSchema.parse(JSON.parse(order.snapshot_json));
    const covered = snapshot.lines
      .filter((line) => line.planCovered)
      .reduce((sum, line) => sum + line.quantity, 0);
    quantity += covered;
    if (covered) lastOrderAt = Math.max(lastOrderAt ?? 0, order.created_at);
  }
  return { ...plan, guestCount: row.guest_count, orderedQuantity: quantity, lastOrderAt };
}

export function previewCart(
  catalog: Catalog,
  lines: CartLine[],
  version: number,
  plan: PlanContext | null,
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

export async function getTableState(services: ApiServices, actor: Actor): Promise<TableState> {
  return observeOperation(
    "tablecast.table.read",
    async () => {
      const db = services.db;
      ensure(actor.tableSessionId, "TABLE_REQUIRED", 403);
      const sessionId = actor.tableSessionId;
      // cursorを先に読む。同じbatchの後続状態より先の更新を既読扱いにしない。
      const [history, sessions, catalogs, tables, orderRows, paymentRows, confirmations] =
        await db.batch([
          db
            .select()
            .from(business.tableEvents)
            .where(
              and(
                eq(business.tableEvents.table_session_id, sessionId),
                eq(business.tableEvents.store_id, actor.storeId),
              ),
            )
            .orderBy(desc(business.tableEvents.cursor))
            .limit(100),
          db
            .select()
            .from(business.tableSessions)
            .where(
              and(
                eq(business.tableSessions.id, sessionId),
                eq(business.tableSessions.store_id, actor.storeId),
              ),
            ),
          catalogQuery(db, actor.storeId, actor.demoId),
          db
            .select({
              id: business.tableSessions.id,
              name: business.restaurantTables.name,
              bill_requested: exists(
                db
                  .select({ cursor: business.tableEvents.cursor })
                  .from(business.tableEvents)
                  .where(
                    and(
                      eq(business.tableEvents.store_id, actor.storeId),
                      eq(business.tableEvents.table_session_id, sessionId),
                      eq(business.tableEvents.kind, "bill.requested"),
                    ),
                  ),
              ).mapWith(Number),
            })
            .from(business.tableSessions)
            .leftJoin(
              business.restaurantTables,
              eq(business.restaurantTables.id, business.tableSessions.table_id),
            )
            .where(
              and(
                eq(business.tableSessions.id, sessionId),
                eq(business.tableSessions.store_id, actor.storeId),
              ),
            ),
          db
            .select()
            .from(business.orders)
            .where(
              and(
                eq(business.orders.table_session_id, sessionId),
                eq(business.orders.store_id, actor.storeId),
              ),
            )
            .orderBy(business.orders.created_at),
          db
            .select({
              table_session_id: business.payments.table_session_id,
              kind: business.payments.kind,
              total: sumAmount(business.payments.amount).mapWith(Number),
            })
            .from(business.payments)
            .where(
              and(
                eq(business.payments.table_session_id, sessionId),
                eq(business.payments.store_id, actor.storeId),
              ),
            )
            .groupBy(business.payments.table_session_id, business.payments.kind),
          db
            .select()
            .from(business.confirmations)
            .where(
              and(
                eq(business.confirmations.table_session_id, sessionId),
                eq(business.confirmations.store_id, actor.storeId),
                inArray(business.confirmations.status, ["pending", "read"]),
                gt(business.confirmations.expires_at, Date.now()),
              ),
            )
            .orderBy(desc(business.confirmations.created_at))
            .limit(1),
        ]);
      const row = await validateSession(services, actor, sessions[0]);
      const catalog = catalogValue(catalogs[0], actor.demoId);
      return tableStateValue(
        row,
        catalog,
        tables[0],
        orderRows,
        paymentRows,
        confirmations[0],
        history.toReversed(),
      );
    },
    { env: services.env, input: { actor } },
  );
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
  const plan = row.plan_json ? tablePlanSchema.parse(JSON.parse(row.plan_json)) : null;
  const orders = orderRows.map(orderValue);
  const cart = previewCart(
    catalog,
    cartLineSchema.array().parse(JSON.parse(row.cart_json)),
    row.cart_version,
    planFromOrders(row, orderRows),
  );
  const orderedTotal = orders
    .filter((order) => !["cancelled", "rejected"].includes(order.status))
    .reduce((sum, order) => sum + order.total, 0);
  const adjustmentTotal = payments.find((p) => p.kind === "adjustment")?.total ?? 0;
  const paidTotal = payments.find((p) => p.kind === "payment")?.total ?? 0;
  return {
    id: row.id,
    tableId: row.table_id,
    kind: row.kind,
    tableName: table?.name ?? "",
    storeId: row.store_id,
    storeName: catalog.storeName,
    configVersion: catalog.version,
    locale: row.locale,
    status: row.status,
    voiceState: row.voice_state,
    voiceSessionId: row.voice_session_id,
    uiSection: row.ui_section,
    selectedProductId:
      row.ui_section === "menu" &&
      catalog.configuration.products.some((product) => product.id === row.selected_product_id)
        ? row.selected_product_id
        : null,
    speechSpeed: row.speech_speed,
    guestCount: row.guest_count,
    openedAt: row.opened_at,
    cart,
    orders,
    events: history.map(eventValue),
    cursor: history.at(-1)?.cursor ?? 0,
    bill: billValue(
      { orderedTotal, adjustmentTotal, paidTotal, cartTotal: cart.total },
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

type PaymentTotal = { table_session_id: string; kind: string; total: number };
type TableSummary = { id: string; name: string | null; bill_requested: number };
