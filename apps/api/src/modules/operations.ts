import type { z } from "zod";
import type { Actor } from "../auth";
import type {
  ConfirmationRecord,
  EventRecord,
  OrderRecord,
  StoreRecord,
  TableRecord,
} from "../db/records";
import { DomainError, ensure } from "../errors";
import {
  cartLineSchema,
  configurationSchema,
  snapshotSchema,
  tablePlanSchema,
  eventDataSchema,
  uiSectionInputSchema,
  speechSpeedInputSchema,
  showProductsSchema,
  voiceToolEventSchema,
  type AdminState,
  type Bill,
  type Cart,
  type CartLine,
  type CartUpdate,
  type Catalog,
  type HistoryPage,
  type HistoryQuery,
  type Locale,
  type Order,
  type SessionEventsPage,
  type SessionEventsQuery,
  type Snapshot,
  type TableEvent,
  type TableState,
} from "../schema";
import { confirmationText, priceCart, type PlanContext } from "./pricing";

export async function getCatalog(env: TablecastEnv, storeId: string): Promise<Catalog> {
  const store = await env.TABLECAST_DB.prepare("SELECT * FROM stores WHERE id=?")
    .bind(storeId)
    .first<StoreRecord>();
  ensure(store, "STORE_NOT_FOUND", 404);
  return {
    storeId: store.id,
    storeName: store.name,
    version: store.config_version,
    configuration: configurationSchema.parse(JSON.parse(store.config_json)),
  };
}
export async function getSession(env: TablecastEnv, actor: Actor): Promise<TableRecord> {
  ensure(actor.tableSessionId, "TABLE_REQUIRED", 403);
  const row = await env.TABLECAST_DB.prepare(
    "SELECT * FROM table_sessions WHERE id=? AND store_id=?",
  )
    .bind(actor.tableSessionId, actor.storeId)
    .first<TableRecord>();
  ensure(row, "TABLE_NOT_FOUND", 404);
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
function orderValue(row: OrderRecord): Order {
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
function eventValue(row: EventRecord): TableEvent {
  return {
    cursor: row.cursor,
    storeId: row.store_id,
    tableSessionId: row.table_session_id,
    kind: row.kind,
    data: eventDataSchema.parse(JSON.parse(row.data_json)),
    createdAt: row.created_at,
  };
}
function voiceCondition(actor: Actor): { sql: string; values: (string | null)[] } {
  return actor.kind === "voice"
    ? {
        sql: " AND voice_state='active' AND voice_session_id=? AND active_turn_id=?",
        values: [actor.voiceSessionId ?? null, actor.turnId ?? null],
      }
    : { sql: "", values: [] };
}
export async function notifyStore(env: TablecastEnv, storeId: string) {
  const row = await env.TABLECAST_DB.prepare(
    "SELECT MAX(cursor) AS cursor FROM table_events WHERE store_id=?",
  )
    .bind(storeId)
    .first<{ cursor: number | null }>();
  try {
    await env.TABLECAST_EVENTS.get(env.TABLECAST_EVENTS.idFromName(storeId)).notify(
      row?.cursor ?? 0,
    );
  } catch {
    console.warn(JSON.stringify({ event: "tablecast.notification_failed", storeId }));
  }
}
function eventStatement(
  env: TablecastEnv,
  actor: Actor,
  mutation: string,
  kind: string,
  data: unknown,
) {
  return env.TABLECAST_DB.prepare(
    "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) SELECT store_id,id,?,?,? FROM table_sessions WHERE id=? AND store_id=? AND mutation_id=?",
  ).bind(kind, JSON.stringify(data), Date.now(), actor.tableSessionId, actor.storeId, mutation);
}
function invalidationStatement(env: TablecastEnv, actor: Actor, mutation: string) {
  return env.TABLECAST_DB.prepare(
    "UPDATE confirmations SET status='invalid' WHERE table_session_id=? AND status IN ('pending','read') AND EXISTS (SELECT 1 FROM table_sessions WHERE id=? AND mutation_id=?)",
  ).bind(actor.tableSessionId, actor.tableSessionId, mutation);
}
function interruptVoiceTurns(env: TablecastEnv, actor: Actor, mutation: string) {
  return env.TABLECAST_DB.prepare(
    "UPDATE voice_turns SET status='interrupted',ended_at=? WHERE table_session_id=? AND store_id=? AND status='started' AND EXISTS(SELECT 1 FROM table_sessions s WHERE s.id=? AND s.mutation_id=? AND s.voice_session_id IS NOT voice_turns.voice_session_id)",
  ).bind(Date.now(), actor.tableSessionId, actor.storeId, actor.tableSessionId, mutation);
}
async function planContext(env: TablecastEnv, row: TableRecord): Promise<PlanContext | null> {
  if (!row.plan_json) return null;
  const plan = tablePlanSchema.parse(JSON.parse(row.plan_json));
  const orders = await env.TABLECAST_DB.prepare(
    "SELECT * FROM orders WHERE table_session_id=? AND status NOT IN ('cancelled','rejected')",
  )
    .bind(row.id)
    .all<OrderRecord>();
  let quantity = 0;
  let lastOrderAt: number | null = null;
  for (const order of orders.results) {
    const snapshot = snapshotSchema.parse(JSON.parse(order.snapshot_json));
    const covered = snapshot.lines
      .filter((line) => line.planCovered)
      .reduce((sum, line) => sum + line.quantity, 0);
    quantity += covered;
    if (covered) lastOrderAt = Math.max(lastOrderAt ?? 0, order.created_at);
  }
  return { ...plan, guestCount: row.guest_count, orderedQuantity: quantity, lastOrderAt };
}
function previewCart(
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
      } catch {
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
export async function getEvents(
  env: TablecastEnv,
  actor: Actor,
  after = 0,
): Promise<{ events: TableEvent[]; cursor: number }> {
  const rows = actor.tableSessionId
    ? await env.TABLECAST_DB.prepare(
        "SELECT * FROM table_events WHERE store_id=? AND (table_session_id=? OR (table_session_id IS NULL AND kind='configuration.published')) AND cursor>? ORDER BY cursor LIMIT 500",
      )
        .bind(actor.storeId, actor.tableSessionId, after)
        .all<EventRecord>()
    : await env.TABLECAST_DB.prepare(
        "SELECT * FROM table_events WHERE store_id=? AND cursor>? ORDER BY cursor LIMIT 500",
      )
        .bind(actor.storeId, after)
        .all<EventRecord>();
  return {
    events: rows.results.map((row) => {
      const event = eventValue(row);
      // 卓へは設定更新の通知だけを渡し、公開者や下書きの情報を渡さない。
      if (actor.tableSessionId && row.table_session_id === null) event.data = {};
      return event;
    }),
    cursor: rows.results.at(-1)?.cursor ?? after,
  };
}
function billValue(
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
export async function getHistory(
  env: TablecastEnv,
  actor: Actor,
  query: HistoryQuery,
): Promise<HistoryPage> {
  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const cursor =
    query.beforeClosedAt !== undefined && query.beforeId !== undefined
      ? { sql: " AND (s.closed_at,s.id)<(?,?)", values: [query.beforeClosedAt, query.beforeId] }
      : { sql: "", values: [] };
  const rows = await env.TABLECAST_DB.prepare(
    `WITH page AS (
      SELECT s.id,s.store_id,s.table_id,t.name AS table_name,s.locale,s.guest_count,s.opened_at,s.closed_at,s.plan_json
      FROM table_sessions s JOIN restaurant_tables t ON t.id=s.table_id AND t.store_id=s.store_id
      WHERE s.store_id=? AND s.status='closed' AND s.closed_at IS NOT NULL${cursor.sql}
      ORDER BY s.closed_at DESC,s.id DESC LIMIT ?
    )
    SELECT page.*,
      (SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE o.table_session_id=page.id AND o.store_id=page.store_id AND o.status NOT IN ('cancelled','rejected')) AS ordered_total,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.table_session_id=page.id AND p.store_id=page.store_id AND p.kind='adjustment') AS adjustment_total,
      (SELECT COALESCE(SUM(p.amount),0) FROM payments p WHERE p.table_session_id=page.id AND p.store_id=page.store_id AND p.kind='payment') AS paid_total
    FROM page
    ORDER BY page.closed_at DESC,page.id DESC`,
  )
    .bind(actor.storeId, ...cursor.values, query.limit + 1)
    .all<{
      id: string;
      table_id: string;
      table_name: string;
      locale: Locale;
      guest_count: number;
      opened_at: number;
      closed_at: number;
      plan_json: string | null;
      ordered_total: number;
      adjustment_total: number;
      paid_total: number;
    }>();
  const sessions = rows.results.slice(0, query.limit).map((row) => ({
    id: row.id,
    tableId: row.table_id,
    tableName: row.table_name,
    locale: row.locale,
    guestCount: row.guest_count,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    bill: billValue(
      {
        orderedTotal: row.ordered_total,
        adjustmentTotal: row.adjustment_total,
        paidTotal: row.paid_total,
        cartTotal: 0,
      },
      row.plan_json ? tablePlanSchema.parse(JSON.parse(row.plan_json)) : null,
      row.guest_count,
    ),
  }));
  const last = sessions.at(-1);
  return {
    sessions,
    nextCursor:
      rows.results.length > query.limit && last ? { closedAt: last.closedAt, id: last.id } : null,
  };
}
export async function getSessionEvents(
  env: TablecastEnv,
  actor: Actor,
  query: SessionEventsQuery,
): Promise<SessionEventsPage> {
  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const row = await getSession(env, actor);
  const cursor =
    query.before === undefined
      ? { sql: "", values: [] }
      : { sql: " AND cursor<?", values: [query.before] };
  const rows = await env.TABLECAST_DB.prepare(
    `SELECT * FROM table_events WHERE table_session_id=? AND store_id=?${cursor.sql} ORDER BY cursor DESC LIMIT ?`,
  )
    .bind(row.id, actor.storeId, ...cursor.values, query.limit + 1)
    .all<EventRecord>();
  const events = rows.results.slice(0, query.limit).reverse().map(eventValue);
  return {
    events,
    nextBefore: rows.results.length > query.limit ? (events[0]?.cursor ?? null) : null,
  };
}
export async function getTableState(env: TablecastEnv, actor: Actor): Promise<TableState> {
  // 状態読取中の更新を既読扱いにしないよう、回復用cursorを先に確定する。
  const history = await env.TABLECAST_DB.prepare(
    "SELECT * FROM (SELECT * FROM table_events WHERE table_session_id=? AND store_id=? ORDER BY cursor DESC LIMIT 100) ORDER BY cursor",
  )
    .bind(actor.tableSessionId ?? null, actor.storeId)
    .all<EventRecord>();
  const row = await getSession(env, actor);
  const catalog = await getCatalog(env, row.store_id);
  const table = await env.TABLECAST_DB.prepare(
    "SELECT name,EXISTS(SELECT 1 FROM table_events WHERE store_id=? AND table_session_id=? AND kind='bill.requested') AS bill_requested FROM restaurant_tables WHERE id=? AND store_id=?",
  )
    .bind(row.store_id, row.id, row.table_id, row.store_id)
    .first<{ name: string; bill_requested: number }>();
  const orderRows = await env.TABLECAST_DB.prepare(
    "SELECT * FROM orders WHERE table_session_id=? AND store_id=? ORDER BY created_at",
  )
    .bind(row.id, row.store_id)
    .all<OrderRecord>();
  const payments = await env.TABLECAST_DB.prepare(
    "SELECT kind,COALESCE(SUM(amount),0) AS total FROM payments WHERE table_session_id=? GROUP BY kind",
  )
    .bind(row.id)
    .all<{ kind: string; total: number }>();
  const confirmation = await env.TABLECAST_DB.prepare(
    "SELECT * FROM confirmations WHERE table_session_id=? AND status IN ('pending','read') AND expires_at>? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(row.id, Date.now())
    .first<ConfirmationRecord>();
  const plan = row.plan_json ? tablePlanSchema.parse(JSON.parse(row.plan_json)) : null;
  const orders = orderRows.results.map(orderValue);
  const cart = previewCart(
    catalog,
    cartLineSchema.array().parse(JSON.parse(row.cart_json)),
    row.cart_version,
    await planContext(env, row),
  );
  const orderedTotal = orders
    .filter((order) => !["cancelled", "rejected"].includes(order.status))
    .reduce((sum, order) => sum + order.total, 0);
  const adjustmentTotal = payments.results.find((p) => p.kind === "adjustment")?.total ?? 0;
  const paidTotal = payments.results.find((p) => p.kind === "payment")?.total ?? 0;
  return {
    id: row.id,
    tableId: row.table_id,
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
    events: history.results.map(eventValue),
    cursor: history.results.at(-1)?.cursor ?? 0,
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
export async function getAdminState(env: TablecastEnv, actor: Actor): Promise<AdminState> {
  const store = await getCatalog(env, actor.storeId);
  // カーソルを先に確保することで、状態取得中のイベントも再取得できる。
  const cursor = await env.TABLECAST_DB.prepare(
    "SELECT COALESCE(MAX(cursor),0) AS cursor FROM table_events WHERE store_id=?",
  )
    .bind(actor.storeId)
    .first<{ cursor: number }>();
  const rows = await env.TABLECAST_DB.prepare(
    "SELECT id FROM table_sessions WHERE store_id=? AND status='open' ORDER BY table_id",
  )
    .bind(actor.storeId)
    .all<{ id: string }>();
  const vacant = await env.TABLECAST_DB.prepare(
    "SELECT id,name FROM restaurant_tables t WHERE store_id=? AND NOT EXISTS(SELECT 1 FROM table_sessions s WHERE s.table_id=t.id AND s.status='open') ORDER BY name",
  )
    .bind(actor.storeId)
    .all<{ id: string; name: string }>();
  const tables = await Promise.all(
    rows.results.map((row) => getTableState(env, { ...actor, tableSessionId: row.id })),
  );
  const events = await env.TABLECAST_DB.prepare(
    "SELECT * FROM (SELECT * FROM table_events WHERE store_id=? ORDER BY cursor DESC LIMIT 100) ORDER BY cursor",
  )
    .bind(actor.storeId)
    .all<EventRecord>();
  return {
    store: { id: store.storeId, name: store.storeName, role: actor.role ?? "member" },
    tables,
    vacantTables: vacant.results,
    events: events.results.map(eventValue),
    cursor: cursor?.cursor ?? 0,
  };
}
export async function setUiSection(
  env: TablecastEnv,
  actor: Actor,
  input: z.infer<typeof uiSectionInputSchema>,
): Promise<TableState> {
  const parsed = uiSectionInputSchema.safeParse(input);
  ensure(parsed.success, "INVALID_INPUT", 422);
  const session = await getSession(env, actor);
  ensure(session.status === "open", "SESSION_CLOSED");
  const productId = parsed.data.section === "menu" ? (parsed.data.productId ?? null) : null;
  const catalog = productId ? await getCatalog(env, actor.storeId) : null;
  ensure(
    !productId || catalog?.configuration.products.some((product) => product.id === productId),
    "PRODUCT_NOT_FOUND",
    422,
  );
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      `UPDATE table_sessions SET ui_section=?,selected_product_id=?,mutation_id=? WHERE id=? AND store_id=? AND status='open'${gate.sql} AND (? IS NULL OR EXISTS(SELECT 1 FROM stores WHERE id=? AND config_version=?))`,
    ).bind(
      parsed.data.section,
      productId,
      mutation,
      session.id,
      actor.storeId,
      ...gate.values,
      productId,
      actor.storeId,
      catalog?.version ?? null,
    ),
    eventStatement(env, actor, mutation, "table.ui", { section: parsed.data.section, productId }),
  ]);
  ensure(result[0]?.meta.changes === 1, "TABLE_CONFLICT");
  await notifyStore(env, actor.storeId);
  return getTableState(env, actor);
}

export async function setSpeechSpeed(
  env: TablecastEnv,
  actor: Actor,
  input: z.infer<typeof speechSpeedInputSchema>,
): Promise<TableState> {
  const parsed = speechSpeedInputSchema.safeParse(input);
  ensure(parsed.success, "INVALID_INPUT", 422);
  const session = await getSession(env, actor);
  ensure(session.status === "open", "SESSION_CLOSED");
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      `UPDATE table_sessions SET speech_speed=?,mutation_id=? WHERE id=? AND store_id=? AND status='open'${gate.sql}`,
    ).bind(parsed.data.speed, mutation, session.id, actor.storeId, ...gate.values),
    eventStatement(env, actor, mutation, "voice.speed", parsed.data),
  ]);
  ensure(result[0]?.meta.changes === 1, "TABLE_CONFLICT");
  await notifyStore(env, actor.storeId);
  return getTableState(env, actor);
}

export async function showProducts(
  env: TablecastEnv,
  actor: Actor,
  input: z.infer<typeof showProductsSchema>,
) {
  ensure(actor.kind === "voice" && actor.turnId && actor.voiceSessionId, "VOICE_REQUIRED", 403);
  const parsed = showProductsSchema.safeParse(input);
  ensure(parsed.success, "INVALID_INPUT", 422);
  await getSession(env, actor);
  const catalog = await getCatalog(env, actor.storeId);
  const productIds = [...new Set(parsed.data.productIds)];
  ensure(
    productIds.every((id) => catalog.configuration.products.some((product) => product.id === id)),
    "PRODUCT_NOT_FOUND",
    422,
  );
  const gate = voiceCondition(actor);
  const result = await env.TABLECAST_DB.prepare(
    `INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) SELECT store_id,id,'voice.products',?,? FROM table_sessions WHERE id=? AND store_id=? AND status='open'${gate.sql} AND EXISTS(SELECT 1 FROM stores WHERE id=? AND config_version=?)`,
  )
    .bind(
      JSON.stringify({ turnId: actor.turnId, productIds }),
      Date.now(),
      actor.tableSessionId,
      actor.storeId,
      ...gate.values,
      actor.storeId,
      catalog.version,
    )
    .run();
  ensure(result.meta.changes === 1, "TABLE_CONFLICT");
  await notifyStore(env, actor.storeId);
  return { productIds };
}

export async function recordVoiceEvent(
  env: TablecastEnv,
  actor: Actor,
  event: { kind: "voice.tool"; data: Omit<z.infer<typeof voiceToolEventSchema>, "turnId"> },
  reserve = false,
) {
  ensure(actor.kind === "voice" && actor.turnId && actor.voiceSessionId, "VOICE_REQUIRED", 403);
  const data = voiceToolEventSchema.parse({
    ...event.data,
    turnId: actor.turnId,
  });
  const gate = voiceCondition(actor);
  const result = await env.TABLECAST_DB.prepare(
    `INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) SELECT store_id,id,?,?,? FROM table_sessions WHERE id=? AND store_id=? AND status='open'${gate.sql} AND (?<>'running' OR NOT EXISTS(SELECT 1 FROM table_events WHERE table_session_id=? AND kind='voice.tool' AND json_extract(data_json,'$.toolCallId')=? AND json_extract(data_json,'$.state')='running'))`,
  )
    .bind(
      event.kind,
      JSON.stringify(data),
      Date.now(),
      actor.tableSessionId,
      actor.storeId,
      ...gate.values,
      reserve ? data.state : "",
      actor.tableSessionId,
      data.toolCallId,
    )
    .run();
  if (result.meta.changes === 1) await notifyStore(env, actor.storeId);
  return result.meta.changes === 1;
}

export async function updateCart(
  env: TablecastEnv,
  actor: Actor,
  input: CartUpdate,
): Promise<TableState> {
  const session = await getSession(env, actor);
  ensure(session.status === "open", "SESSION_CLOSED");
  const catalog = await getCatalog(env, actor.storeId);
  priceCart(
    catalog.configuration,
    input.lines,
    input.expectedVersion,
    await planContext(env, session),
  );
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      `UPDATE table_sessions SET cart_json=?,cart_version=cart_version+1,mutation_id=? WHERE id=? AND store_id=? AND status='open' AND cart_version=? AND EXISTS (SELECT 1 FROM stores WHERE id=? AND config_version=?)${gate.sql}`,
    ).bind(
      JSON.stringify(input.lines),
      mutation,
      session.id,
      actor.storeId,
      input.expectedVersion,
      actor.storeId,
      catalog.version,
      ...gate.values,
    ),
    invalidationStatement(env, actor, mutation),
    eventStatement(env, actor, mutation, "cart.updated", {
      version: input.expectedVersion + 1,
      source: actor.kind,
    }),
  ]);
  ensure(result[0]?.meta.changes === 1, "CART_CONFLICT");
  await notifyStore(env, actor.storeId);
  return getTableState(env, actor);
}
export async function prepareConfirmation(
  env: TablecastEnv,
  actor: Actor,
  input: { expectedVersion: number; channel: "gui" | "voice" },
): Promise<Snapshot> {
  const session = await getSession(env, actor);
  ensure(session.status === "open", "SESSION_CLOSED");
  ensure(
    input.channel === "gui"
      ? actor.kind === "device" || actor.kind === "staff"
      : actor.kind === "voice" && actor.turnId,
    "CONFIRMATION_CHANNEL",
    403,
  );
  const catalog = await getCatalog(env, actor.storeId);
  const plan = await planContext(env, session);
  const cart = priceCart(
    catalog.configuration,
    cartLineSchema.array().parse(JSON.parse(session.cart_json)),
    session.cart_version,
    plan,
  );
  ensure(cart.complete, "CART_INCOMPLETE", 422);
  const now = Date.now();
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const snapshotPlan = plan
    ? {
        id: plan.id,
        name: { ja: plan.rules.text.ja.displayName, en: plan.rules.text.en.displayName },
      }
    : null;
  const snapshot: Snapshot = {
    id: crypto.randomUUID(),
    tableSessionId: session.id,
    cartVersion: session.cart_version,
    configVersion: catalog.version,
    lines: cart.lines,
    total: cart.total,
    locale: session.locale,
    text: confirmationText(cart.lines, cart.total, session.locale, snapshotPlan),
    expiresAt:
      plan && cart.lines.some((line) => line.planCovered)
        ? Math.min(
            now + 120000,
            plan.startedAt +
              (plan.rules.durationMinutes - plan.rules.lastOrderMinutesBeforeEnd) * 60000,
          )
        : now + 120000,
    channel: input.channel,
    status: "pending",
    createdTurnId: actor.turnId ?? null,
    plan: snapshotPlan,
  };
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      `UPDATE table_sessions SET mutation_id=? WHERE id=? AND store_id=? AND status='open' AND cart_version=? AND EXISTS(SELECT 1 FROM stores WHERE id=? AND config_version=?)${gate.sql}`,
    ).bind(
      mutation,
      session.id,
      actor.storeId,
      input.expectedVersion,
      actor.storeId,
      catalog.version,
      ...gate.values,
    ),
    invalidationStatement(env, actor, mutation),
    env.TABLECAST_DB.prepare(
      "INSERT INTO confirmations(id,store_id,table_session_id,cart_version,config_version,channel,voice_session_id,created_turn_id,status,snapshot_json,expires_at,created_at) SELECT ?,store_id,id,?,?,?,?,?,'pending',?,?,? FROM table_sessions WHERE id=? AND mutation_id=?",
    ).bind(
      snapshot.id,
      snapshot.cartVersion,
      snapshot.configVersion,
      snapshot.channel,
      actor.voiceSessionId ?? null,
      actor.turnId ?? null,
      JSON.stringify(snapshot),
      snapshot.expiresAt,
      now,
      session.id,
      mutation,
    ),
    eventStatement(env, actor, mutation, "confirmation.prepared", {
      snapshotId: snapshot.id,
      channel: snapshot.channel,
    }),
  ]);
  ensure(result[0]?.meta.changes === 1, "CART_CONFLICT");
  await notifyStore(env, actor.storeId);
  return snapshot;
}
export async function getVoiceConfirmation(
  env: TablecastEnv,
  actor: Actor,
): Promise<Snapshot | null> {
  await getSession(env, actor);
  const row = await env.TABLECAST_DB.prepare(
    "SELECT * FROM confirmations WHERE table_session_id=? AND voice_session_id=? AND status='pending' AND expires_at>? AND created_turn_id=? ORDER BY created_at DESC LIMIT 1",
  )
    .bind(actor.tableSessionId, actor.voiceSessionId, Date.now(), actor.turnId)
    .first<ConfirmationRecord>();
  return row ? snapshotSchema.parse(JSON.parse(row.snapshot_json)) : null;
}
export async function markConfirmationRead(env: TablecastEnv, actor: Actor, id: string) {
  await getSession(env, actor);
  ensure(actor.kind === "voice", "VOICE_ONLY", 403);
  const result = await env.TABLECAST_DB.prepare(
    "UPDATE confirmations SET status='read',read_at=? WHERE id=? AND table_session_id=? AND voice_session_id=? AND status='pending' AND expires_at>? AND created_turn_id=? AND EXISTS(SELECT 1 FROM table_sessions WHERE id=? AND store_id=confirmations.store_id AND status='open' AND voice_state='active' AND voice_session_id=? AND active_turn_id=? AND cart_version=confirmations.cart_version) AND config_version=(SELECT config_version FROM stores WHERE id=confirmations.store_id)",
  )
    .bind(
      Date.now(),
      id,
      actor.tableSessionId,
      actor.voiceSessionId,
      Date.now(),
      actor.turnId,
      actor.tableSessionId,
      actor.voiceSessionId,
      actor.turnId,
    )
    .run();
  ensure(result.meta.changes === 1, "CONFIRMATION_STALE");
}
export async function submitOrder(
  env: TablecastEnv,
  actor: Actor,
  input: { snapshotId: string; idempotencyKey: string; approved: true },
): Promise<Order> {
  ensure(input.approved, "APPROVAL_REQUIRED", 422);
  await getSession(env, actor);
  const existing = await env.TABLECAST_DB.prepare(
    "SELECT * FROM orders WHERE table_session_id=? AND store_id=? AND idempotency_key=?",
  )
    .bind(actor.tableSessionId, actor.storeId, input.idempotencyKey)
    .first<OrderRecord>();
  if (existing) {
    ensure(existing.snapshot_id === input.snapshotId, "IDEMPOTENCY_CONFLICT");
    return orderValue(existing);
  }
  const confirmation = await env.TABLECAST_DB.prepare(
    "SELECT * FROM confirmations WHERE id=? AND store_id=? AND table_session_id=?",
  )
    .bind(input.snapshotId, actor.storeId, actor.tableSessionId)
    .first<ConfirmationRecord>();
  ensure(confirmation, "CONFIRMATION_NOT_FOUND", 404);
  const session = await getSession(env, actor);
  const catalog = await getCatalog(env, actor.storeId);
  priceCart(
    catalog.configuration,
    cartLineSchema.array().parse(JSON.parse(session.cart_json)),
    session.cart_version,
    await planContext(env, session),
  );
  if (actor.kind === "voice") {
    const turn = await env.TABLECAST_DB.prepare(
      "SELECT started_at FROM voice_turns WHERE id=? AND voice_session_id=?",
    )
      .bind(actor.turnId, actor.voiceSessionId)
      .first<{ started_at: number }>();
    ensure(
      turn && confirmation.read_at && turn.started_at > confirmation.read_at,
      "NEW_APPROVAL_TURN_REQUIRED",
    );
  }
  if (actor.kind === "voice")
    ensure(
      confirmation.channel === "voice" &&
        confirmation.voice_session_id === actor.voiceSessionId &&
        confirmation.status === "read" &&
        !!confirmation.read_at &&
        !!actor.turnId &&
        actor.turnId !== confirmation.created_turn_id,
      "READ_APPROVAL_REQUIRED",
    );
  else
    ensure(
      (actor.kind === "device" || actor.kind === "staff") && confirmation.channel === "gui",
      "CONFIRMATION_CHANNEL",
      403,
    );
  const now = Date.now();
  const mutation = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const snapshot: Snapshot = {
    ...snapshotSchema.parse(JSON.parse(confirmation.snapshot_json)),
    status: "submitted",
  };
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      `UPDATE table_sessions SET cart_json='[]',cart_version=cart_version+1,mutation_id=? WHERE id=? AND store_id=? AND status='open' AND cart_version=? AND EXISTS(SELECT 1 FROM confirmations c JOIN stores s ON s.id=c.store_id WHERE c.id=? AND c.table_session_id=table_sessions.id AND c.cart_version=table_sessions.cart_version AND c.config_version=s.config_version AND c.expires_at>? AND c.status=?)${gate.sql}`,
    ).bind(
      mutation,
      actor.tableSessionId,
      actor.storeId,
      confirmation.cart_version,
      confirmation.id,
      now,
      actor.kind === "voice" ? "read" : "pending",
      ...gate.values,
    ),
    env.TABLECAST_DB.prepare(
      "INSERT INTO orders(id,store_id,table_session_id,snapshot_id,idempotency_key,status,snapshot_json,total,created_at,updated_at) SELECT ?,store_id,id,?,?,'submitted',?,?,?,? FROM table_sessions WHERE id=? AND mutation_id=?",
    ).bind(
      orderId,
      confirmation.id,
      input.idempotencyKey,
      JSON.stringify(snapshot),
      snapshot.total,
      now,
      now,
      actor.tableSessionId,
      mutation,
    ),
    env.TABLECAST_DB.prepare(
      "UPDATE confirmations SET status='submitted' WHERE id=? AND EXISTS(SELECT 1 FROM table_sessions WHERE id=? AND mutation_id=?)",
    ).bind(confirmation.id, actor.tableSessionId, mutation),
    eventStatement(env, actor, mutation, "order.submitted", {
      orderId,
      total: snapshot.total,
      source: actor.kind,
    }),
  ]);
  if (result[0]?.meta.changes !== 1) {
    const retry = await env.TABLECAST_DB.prepare(
      "SELECT * FROM orders WHERE table_session_id=? AND idempotency_key=? AND snapshot_id=?",
    )
      .bind(actor.tableSessionId, input.idempotencyKey, input.snapshotId)
      .first<OrderRecord>();
    if (retry) return orderValue(retry);
    throw new DomainError("CONFIRMATION_STALE", 409, "CONFIRMATION_STALE");
  }
  await notifyStore(env, actor.storeId);
  return {
    id: orderId,
    tableSessionId: session.id,
    snapshotId: snapshot.id,
    idempotencyKey: input.idempotencyKey,
    status: "submitted",
    snapshot,
    total: snapshot.total,
    createdAt: now,
  };
}
export async function callStaff(env: TablecastEnv, actor: Actor) {
  const row = await getSession(env, actor);
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      `UPDATE table_sessions SET staff_called=1,mutation_id=? WHERE id=? AND store_id=? AND status='open'${gate.sql}`,
    ).bind(mutation, row.id, actor.storeId, ...gate.values),
    eventStatement(env, actor, mutation, "staff.called", { source: actor.kind }),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(env, actor.storeId);
  return getTableState(env, actor);
}
export async function changeLocale(env: TablecastEnv, actor: Actor, locale: Locale) {
  const row = await getSession(env, actor);
  if (row.locale === locale) return getTableState(env, actor);
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      `UPDATE table_sessions SET locale=?,voice_state='stopped',voice_session_id=NULL,active_turn_id=NULL,voice_version=voice_version+1,mutation_id=? WHERE id=? AND store_id=? AND status='open'${gate.sql}`,
    ).bind(locale, mutation, row.id, actor.storeId, ...gate.values),
    invalidationStatement(env, actor, mutation),
    interruptVoiceTurns(env, actor, mutation),
    eventStatement(env, actor, mutation, "locale.changed", { locale }),
    // このツール自身が音声資格を失効させるため、完了状態も同じ更新へ含める。
    env.TABLECAST_DB.prepare(
      `INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at)
       SELECT store_id,table_session_id,'voice.tool',json_set(data_json,'$.state','completed'),?
       FROM table_events WHERE store_id=? AND table_session_id=? AND kind='voice.tool'
       AND json_extract(data_json,'$.turnId')=? AND json_extract(data_json,'$.toolName')='setLanguage'
       AND json_extract(data_json,'$.state')='running'
       AND EXISTS(SELECT 1 FROM table_sessions WHERE id=? AND mutation_id=?)`,
    ).bind(
      Date.now(),
      actor.storeId,
      row.id,
      actor.kind === "voice" ? (actor.turnId ?? null) : null,
      row.id,
      mutation,
    ),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(env, actor.storeId);
  // 言語変更で失効させた音声資格を再利用せず、更新を認可した同じ卓を読み直す。
  return getTableState(env, { kind: "device", storeId: actor.storeId, tableSessionId: row.id });
}
export async function setVoiceSession(
  env: TablecastEnv,
  actor: Actor,
  voiceSessionId: string | null,
  expectedVoiceSessionId?: string,
  expectedVoiceVersion?: number,
) {
  const row = await getSession(env, actor);
  const mutation = crypto.randomUUID();
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "UPDATE table_sessions SET voice_state=?,voice_session_id=?,active_turn_id=NULL,voice_version=voice_version+1,mutation_id=? WHERE id=? AND store_id=? AND status='open' AND (? IS NULL OR voice_session_id=?) AND (? IS NULL OR voice_version=?)",
    ).bind(
      voiceSessionId ? "active" : "stopped",
      voiceSessionId,
      mutation,
      row.id,
      actor.storeId,
      expectedVoiceSessionId ?? null,
      expectedVoiceSessionId ?? null,
      expectedVoiceVersion ?? null,
      expectedVoiceVersion ?? null,
    ),
    // GUIの確認は音声停止後も同じ表示内容に対して承認できる。
    env.TABLECAST_DB.prepare(
      "UPDATE confirmations SET status='invalid' WHERE table_session_id=? AND channel='voice' AND status IN ('pending','read') AND EXISTS(SELECT 1 FROM table_sessions WHERE id=? AND mutation_id=?)",
    ).bind(row.id, row.id, mutation),
    interruptVoiceTurns(env, actor, mutation),
    eventStatement(env, actor, mutation, voiceSessionId ? "voice.started" : "voice.stopped", {
      voiceSessionId: voiceSessionId ?? row.voice_session_id,
    }),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(env, actor.storeId);
  return getTableState(env, actor);
}
export async function changeOrderStatus(
  env: TablecastEnv,
  actor: Actor,
  orderId: string,
  status: Order["status"],
): Promise<Order> {
  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const row = await env.TABLECAST_DB.prepare("SELECT * FROM orders WHERE id=? AND store_id=?")
    .bind(orderId, actor.storeId)
    .first<OrderRecord>();
  ensure(row, "ORDER_NOT_FOUND", 404);
  if (row.status === status) return orderValue(row);
  const transitions: Record<Order["status"], Order["status"][]> = {
    submitted: ["accepted", "rejected", "cancelled"],
    accepted: ["served", "cancelled"],
    served: [],
    cancelled: [],
    rejected: [],
  };
  ensure(transitions[row.status].includes(status), "ORDER_TRANSITION");
  const scoped = { ...actor, tableSessionId: row.table_session_id };
  const table = await getTableState(env, scoped);
  if (status === "cancelled" || status === "rejected")
    ensure(table.bill.due >= row.total, "PAYMENT_CORRECTION_REQUIRED");
  const mutation = crypto.randomUUID();
  const now = Date.now();
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "UPDATE table_sessions SET cart_version=cart_version+1,mutation_id=? WHERE id=? AND store_id=? AND cart_version=? AND status='open' AND EXISTS(SELECT 1 FROM orders WHERE id=? AND status=?)",
    ).bind(mutation, row.table_session_id, actor.storeId, table.cart.version, orderId, row.status),
    env.TABLECAST_DB.prepare(
      "UPDATE orders SET status=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM table_sessions WHERE id=? AND mutation_id=?)",
    ).bind(status, now, orderId, row.table_session_id, mutation),
    invalidationStatement(env, scoped, mutation),
    eventStatement(env, scoped, mutation, "order.status", { orderId, status }),
  ]);
  ensure(result[0]?.meta.changes === 1, "ORDER_CONFLICT");
  await notifyStore(env, actor.storeId);
  return { ...orderValue(row), status };
}
export async function recordPayment(
  env: TablecastEnv,
  actor: Actor,
  input: { amount: number; idempotencyKey: string; kind: "payment" | "adjustment"; reason: string },
) {
  ensure(actor.kind === "staff" && actor.userId, "STAFF_REQUIRED", 403);
  const existing = await env.TABLECAST_DB.prepare(
    "SELECT amount,kind,reason FROM payments WHERE table_session_id=? AND idempotency_key=?",
  )
    .bind(actor.tableSessionId, input.idempotencyKey)
    .first<{ amount: number; kind: string; reason: string }>();
  if (existing) {
    ensure(
      existing.amount === input.amount &&
        existing.kind === input.kind &&
        existing.reason === input.reason,
      "IDEMPOTENCY_CONFLICT",
    );
    return getTableState(env, actor);
  }
  const table = await getTableState(env, actor);
  ensure(table.status === "open", "SESSION_CLOSED");
  if (input.kind === "payment")
    ensure(
      input.amount > 0 ? input.amount <= table.bill.due : table.bill.paidTotal + input.amount >= 0,
      "PAYMENT_AMOUNT",
      422,
    );
  else ensure(table.bill.due + input.amount >= 0, "ADJUSTMENT_AMOUNT", 422);
  const mutation = crypto.randomUUID();
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "UPDATE table_sessions SET cart_version=cart_version+1,mutation_id=? WHERE id=? AND store_id=? AND cart_version=? AND status='open'",
    ).bind(mutation, actor.tableSessionId, actor.storeId, table.cart.version),
    env.TABLECAST_DB.prepare(
      "INSERT INTO payments(id,store_id,table_session_id,idempotency_key,kind,amount,reason,actor_id,created_at) SELECT ?,store_id,id,?,?,?,?,?,? FROM table_sessions WHERE id=? AND mutation_id=?",
    ).bind(
      crypto.randomUUID(),
      input.idempotencyKey,
      input.kind,
      input.amount,
      input.reason,
      actor.userId,
      Date.now(),
      actor.tableSessionId,
      mutation,
    ),
    invalidationStatement(env, actor, mutation),
    eventStatement(env, actor, mutation, `billing.${input.kind}`, {
      amount: input.amount,
      reason: input.reason,
    }),
  ]);
  if (result[0]?.meta.changes !== 1) {
    const retry = await env.TABLECAST_DB.prepare(
      "SELECT amount,kind,reason FROM payments WHERE table_session_id=? AND idempotency_key=?",
    )
      .bind(actor.tableSessionId, input.idempotencyKey)
      .first<{ amount: number; kind: string; reason: string }>();
    ensure(
      retry &&
        retry.amount === input.amount &&
        retry.kind === input.kind &&
        retry.reason === input.reason,
      "BILLING_CONFLICT",
    );
  }
  await notifyStore(env, actor.storeId);
  return getTableState(env, actor);
}
export async function requestBill(env: TablecastEnv, actor: Actor) {
  const row = await getSession(env, actor);
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      `UPDATE table_sessions SET staff_called=1,mutation_id=? WHERE id=? AND store_id=? AND status='open'${gate.sql}`,
    ).bind(mutation, row.id, actor.storeId, ...gate.values),
    eventStatement(env, actor, mutation, "bill.requested", {}),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(env, actor.storeId);
  return getTableState(env, actor);
}
export async function resolveCall(env: TablecastEnv, actor: Actor) {
  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const row = await getSession(env, actor);
  const mutation = crypto.randomUUID();
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "UPDATE table_sessions SET staff_called=0,mutation_id=? WHERE id=? AND store_id=? AND status='open'",
    ).bind(mutation, row.id, actor.storeId),
    eventStatement(env, actor, mutation, "staff.resolved", {}),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(env, actor.storeId);
  return getTableState(env, actor);
}
export async function closeTable(env: TablecastEnv, actor: Actor) {
  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const table = await getTableState(env, actor);
  ensure(
    table.bill.due === 0 &&
      table.cart.lines.length === 0 &&
      table.orders.every((o) => ["served", "cancelled", "rejected"].includes(o.status)),
    "TABLE_NOT_SETTLED",
  );
  const mutation = crypto.randomUUID();
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "UPDATE table_sessions SET status='closed',closed_at=?,voice_state='stopped',voice_session_id=NULL,active_turn_id=NULL,voice_version=voice_version+1,cart_version=cart_version+1,mutation_id=? WHERE id=? AND store_id=? AND status='open' AND cart_version=?",
    ).bind(Date.now(), mutation, actor.tableSessionId, actor.storeId, table.cart.version),
    invalidationStatement(env, actor, mutation),
    interruptVoiceTurns(env, actor, mutation),
    eventStatement(env, actor, mutation, "table.closed", {}),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(env, actor.storeId);
  return getTableState(env, actor);
}
export async function openTable(
  env: TablecastEnv,
  actor: Actor,
  input: { tableId: string; guestCount: number; locale: Locale; planId?: string },
) {
  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const table = await env.TABLECAST_DB.prepare(
    "SELECT id FROM restaurant_tables WHERE id=? AND store_id=?",
  )
    .bind(input.tableId, actor.storeId)
    .first();
  ensure(table, "TABLE_NOT_FOUND", 404);
  const catalog = await getCatalog(env, actor.storeId);
  const plan = input.planId ? catalog.configuration.plans.find((p) => p.id === input.planId) : null;
  if (input.planId) ensure(plan, "PLAN_NOT_FOUND", 422);
  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_sessions(id,store_id,table_id,locale,guest_count,plan_json,opened_at) SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM table_sessions WHERE table_id=? AND status='open')",
    ).bind(
      sessionId,
      actor.storeId,
      input.tableId,
      input.locale,
      input.guestCount,
      plan ? JSON.stringify({ id: plan.id, startedAt: now, rules: plan }) : null,
      now,
      input.tableId,
    ),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) SELECT ?,?,?,?,? WHERE changes()=1",
    ).bind(
      actor.storeId,
      sessionId,
      "table.opened",
      JSON.stringify({ guestCount: input.guestCount }),
      now,
    ),
  ]);
  ensure(result[0]?.meta.changes === 1, "TABLE_CONFLICT");
  await notifyStore(env, actor.storeId);
  return getTableState(env, { ...actor, tableSessionId: sessionId });
}
