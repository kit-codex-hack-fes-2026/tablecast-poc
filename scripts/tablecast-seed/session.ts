import { confirmationText, type PlanContext, priceCart } from "@tablecast/api/bootstrap";
import { business, type Database } from "@tablecast/api/db";
import { resolveText } from "@tablecast/api/localization";
import { type CartLine, type Configuration, type Snapshot } from "@tablecast/api/schema";
import { and, eq, inArray, like, or } from "drizzle-orm";
import { type BatchItem } from "drizzle-orm/batch";
import { type Owner, type SeedEvent, type Store } from "../tablecast-seed-data.ts";

export const tablecastHistoryBaseTime = Date.UTC(2026, 7, 1, 0, 0, 0);

export function sampleLine(config: Configuration, index = 2): CartLine {
  const products = config.products.filter((item) => item.available);
  const product = products[index % products.length];
  if (!product) throw new Error("デモの販売商品がありません。");
  return {
    id: "tablecast-demo-line",
    productId: product.id,
    quantity: 1,
    selections: product.modifiers.flatMap((group) =>
      group.options
        .filter((option) => option.available)
        .slice(0, group.min)
        .map((option) => ({ optionId: option.id, quantity: 1 })),
    ),
  };
}

function syntheticSpeaker(sessionId: string, index: null | number) {
  const streamId = `${sessionId}-synthetic-stream`;
  return { id: index === null ? null : `${streamId}:${index}`, streamId, words: [] };
}

function event(
  storeId: string,
  sessionId: string,
  kind: string,
  data: Record<string, unknown>,
  at: number,
  history = false,
): SeedEvent {
  return {
    storeId,
    sessionId,
    kind,
    data: JSON.stringify({ source: history ? "synthetic-history" : "synthetic-demo", ...data }),
    at,
  };
}

function sessionQueries(db: Database, statements: (BatchItem<"sqlite"> | SeedEvent)[]) {
  const queries: BatchItem<"sqlite">[] = [];
  const events: SeedEvent[] = [];
  for (const statement of statements) {
    if ("kind" in statement) events.push(statement);
    else queries.push(statement);
  }
  // 全列数を含めてもD1の100 bind制限に収まる行数に区切る。
  for (let offset = 0; offset < events.length; offset += 16) {
    queries.push(
      db.insert(business.tableEvents).values(
        events.slice(offset, offset + 16).map((item) => ({
          store_id: item.storeId,
          table_session_id: item.sessionId,
          kind: item.kind,
          data_json: item.data,
          created_at: item.at,
        })),
      ),
    );
  }
  return queries;
}

async function insertSession(db: Database, statements: (BatchItem<"sqlite"> | SeedEvent)[]) {
  const [first, ...rest] = sessionQueries(db, statements);
  if (first) await db.batch([first, ...rest]);
}

function snapshotFor(
  store: Store,
  sessionId: string,
  lines: CartLine[],
  version: number,
  locale: "en" | "ja",
  at: number,
  plan: null | PlanContext = null,
): Snapshot {
  const cart = priceCart(store.configuration, lines, version, plan, at);
  if (!cart.complete) throw new Error("seedの必須選択が不足しています。");
  const snapshotPlan = plan
    ? {
        id: plan.id,
        name: {
          ja: plan.rules.text.ja.displayName,
          en: resolveText(plan.rules.text, "en").displayName,
        },
      }
    : null;
  return {
    id: `${sessionId}-confirmation-${version}`,
    tableSessionId: sessionId,
    cartVersion: version,
    configVersion: store.configVersion ?? 1,
    lines: cart.lines,
    total: cart.total,
    locale,
    text: confirmationText(cart.lines, cart.total, locale, snapshotPlan),
    expiresAt: at + 120_000,
    channel: "gui",
    status: "submitted",
    createdTurnId: null,
    plan: snapshotPlan,
  };
}

function confirmation(db: Database, storeId: string, snapshot: Snapshot, at: number) {
  return db.insert(business.confirmations).values({
    id: snapshot.id,
    store_id: storeId,
    table_session_id: snapshot.tableSessionId,
    cart_version: snapshot.cartVersion,
    config_version: snapshot.configVersion,
    channel: "gui",
    status: snapshot.status,
    snapshot_json: JSON.stringify(snapshot),
    expires_at: snapshot.expiresAt,
    created_at: at,
  });
}

function order(
  db: Database,
  storeId: string,
  snapshot: Snapshot,
  status: "accepted" | "served" | "submitted",
  at: number,
) {
  return db.insert(business.orders).values({
    id: `${snapshot.id}-order`,
    store_id: storeId,
    table_session_id: snapshot.tableSessionId,
    snapshot_id: snapshot.id,
    idempotency_key: `${snapshot.id}-submit`,
    status,
    snapshot_json: JSON.stringify(snapshot),
    total: snapshot.total,
    created_at: at,
    updated_at: status === "submitted" ? at : at + (status === "accepted" ? 3000 : 10000),
  });
}

function payment(
  db: Database,
  storeId: string,
  sessionId: string,
  userId: string,
  amount: number,
  at: number,
) {
  return db.insert(business.payments).values({
    id: `${sessionId}-payment`,
    store_id: storeId,
    table_session_id: sessionId,
    idempotency_key: `${sessionId}-payment`,
    kind: "payment",
    amount,
    reason: "合成デモの模擬支払",
    actor_id: userId,
    created_at: at,
  });
}

export async function seedCurrentTables(
  db: Database,
  store: Store,
  owner: Owner,
  baseTime: number,
) {
  const tableIds = Array.from(
    { length: store.tableCount },
    (_, index) => `${store.id}-table-${(index + 1).toString().padStart(2, "0")}`,
  );
  const existingIds = new Set<string>();
  const occupiedTables = new Set<string>();
  // IDと営業中の卓をまとめて照合し、卓数が増えても100 bindを超えない。
  for (let offset = 0; offset < tableIds.length; offset += 32) {
    const ids = tableIds.slice(offset, offset + 32);
    const existing = await db
      .select({
        id: business.tableSessions.id,
        tableId: business.tableSessions.table_id,
        status: business.tableSessions.status,
      })
      .from(business.tableSessions)
      .where(
        or(
          inArray(
            business.tableSessions.id,
            ids.map((id) => `${id}-session`),
          ),
          and(
            inArray(business.tableSessions.table_id, ids),
            eq(business.tableSessions.status, "open"),
          ),
        ),
      );
    for (const session of existing) {
      existingIds.add(session.id);
      if (session.status === "open" && session.tableId) occupiedTables.add(session.tableId);
    }
  }
  const pending: BatchItem<"sqlite">[] = [];
  for (let number = 1; number <= store.tableCount; number++) {
    const tableId = `${store.id}-table-${number.toString().padStart(2, "0")}`;
    const sessionId = `${tableId}-session`;
    const state = number % 12;
    if (state === 10 || existingIds.has(sessionId) || occupiedTables.has(tableId)) continue;
    const at = baseTime - number * 3 * 60_000;
    const locale = number % 3 === 0 ? "en" : "ja";
    const guestCount = state === 2 ? 2 : 2 + (number % 3);
    const rule = state === 6 ? store.configuration.plans[0] : null;
    const plan = rule ? { id: rule.id, startedAt: at, rules: rule } : null;
    const lines = state === 2 || state === 3 ? [sampleLine(store.configuration)] : [];
    const closed = state === 11;
    const statements: (BatchItem<"sqlite"> | SeedEvent)[] = [
      db.insert(business.tableSessions).values({
        id: sessionId,
        store_id: store.id,
        table_id: tableId,
        locale,
        status: closed ? "closed" : "open",
        guest_count: guestCount,
        cart_version: lines.length ? 1 : closed ? 6 : state >= 4 && state <= 7 ? state - 2 : 0,
        cart_json: JSON.stringify(lines),
        voice_state: state === 9 ? "error" : "stopped",
        staff_called: state === 8 ? 1 : 0,
        plan_json: plan ? JSON.stringify(plan) : null,
        opened_at: at,
        closed_at: closed ? at + 60000 : null,
      }),
      event(store.id, sessionId, "table.opened", { guestCount, locale }, at),
    ];
    if (state === 2) {
      const product = store.configuration.products.find((item) => item.id === lines[0]?.productId);
      if (!product) throw new Error("背景卓の会話に対応する商品がありません。");
      const dialogue = [
        {
          role: "user",
          speaker: syntheticSpeaker(sessionId, 0),
          text:
            locale === "ja"
              ? "ふたりで楽しめるおすすめを教えてください。"
              : "Could you recommend something for the two of us?",
        },
        {
          role: "assistant",
          text: `${resolveText(product.text, locale).displayName}${locale === "ja" ? "。" : ". "}${resolveText(product.text, locale).description}`,
        },
        {
          role: "user",
          speaker: syntheticSpeaker(sessionId, 1),
          text: locale === "ja" ? "それを二つお願いします。" : "Two of those, please.",
        },
        {
          role: "user",
          speaker: syntheticSpeaker(sessionId, 0),
          text:
            locale === "ja"
              ? "すみません、一つに訂正してください。画面でも確認します。"
              : "Sorry, please change that to one. We will check it on screen too.",
        },
        {
          role: "assistant",
          text:
            locale === "ja"
              ? `${product.text.ja.displayName}は一つでカートに入っています。注文はまだ送信していません。`
              : `There is one ${resolveText(product.text, "en").displayName} in your basket. The order has not been sent yet.`,
        },
        {
          role: "user",
          speaker: syntheticSpeaker(sessionId, null),
          text:
            locale === "ja"
              ? "少し待ってください。相談してから注文します。"
              : "Please give us a moment. We will decide together before ordering.",
        },
      ];
      for (const [index, line] of dialogue.entries())
        statements.push(
          event(
            store.id,
            sessionId,
            `voice.${line.role}`,
            { ...line, locale, status: "completed" },
            at + (index + 1) * 5000,
          ),
        );
    }
    if ((state >= 3 && state <= 7) || closed) {
      const snapshot = snapshotFor(
        store,
        sessionId,
        [sampleLine(store.configuration)],
        1,
        locale,
        at + 1000,
        plan ? { ...plan, guestCount, orderedQuantity: 0, lastOrderAt: null } : null,
      );
      if (state === 3) {
        snapshot.status = "pending";
        snapshot.expiresAt = baseTime + 120_000;
      }
      statements.push(
        confirmation(db, store.id, snapshot, at + 1000),
        event(store.id, sessionId, "confirmation.prepared", { snapshotId: snapshot.id }, at + 1000),
      );
      if (state !== 3) {
        const status = state === 4 ? "submitted" : state === 5 ? "accepted" : "served";
        const orderId = `${snapshot.id}-order`;
        statements.push(
          order(db, store.id, snapshot, status, at + 2000),
          event(
            store.id,
            sessionId,
            "order.submitted",
            { orderId, total: snapshot.total },
            at + 2000,
          ),
        );
        if (status !== "submitted")
          statements.push(
            event(store.id, sessionId, "order.status", { orderId, status: "accepted" }, at + 5000),
          );
        if (status === "served")
          statements.push(
            event(store.id, sessionId, "order.status", { orderId, status }, at + 12_000),
          );
        if (state === 7 || closed)
          statements.push(
            payment(db, store.id, sessionId, owner.userId, snapshot.total, at + 20_000),
            event(
              store.id,
              sessionId,
              "billing.payment",
              { amount: snapshot.total, reason: "合成デモの模擬支払" },
              at + 20_000,
            ),
          );
      }
    }
    if (closed) statements.push(event(store.id, sessionId, "table.closed", {}, at + 60_000));
    if (state === 8) statements.push(event(store.id, sessionId, "staff.called", {}, at + 1000));
    if (state === 9)
      statements.push(
        event(store.id, sessionId, "voice.error", { code: "VOICE_UNAVAILABLE" }, at + 1000),
      );
    const queries = sessionQueries(db, statements);
    // 一セッションを分割せず、32 SQL以内のbatchにして直列のbinding往復を減らす。
    if (pending.length + queries.length > 32) {
      const [first, ...rest] = pending;
      if (first) await db.batch([first, ...rest]);
      pending.length = 0;
    }
    pending.push(...queries);
  }
  const [first, ...rest] = pending;
  if (first) await db.batch([first, ...rest]);
}

export async function seedHistory(db: Database, store: Store, owner: Owner) {
  const previous = await db
    .select({ id: business.tableSessions.id })
    .from(business.tableSessions)
    .where(
      and(
        eq(business.tableSessions.store_id, store.id),
        like(business.tableSessions.id, "%-history-%"),
      ),
    );
  const existing = new Set(previous.map((session) => session.id));
  for (let index = 0; index < 200; index++) {
    const sessionId = `${store.id}-history-${index.toString().padStart(3, "0")}`;
    if (existing.has(sessionId)) continue;
    const tableId = `${store.id}-table-${((index % store.tableCount) + 1).toString().padStart(2, "0")}`;
    const openedAt =
      tablecastHistoryBaseTime +
      Math.floor((index * 30) / 200) * 86_400_000 +
      (9 + (index % 8)) * 3_600_000;
    const closedAt = openedAt + 75 * 60_000;
    const locale = index % 3 === 0 ? "en" : "ja";
    const guestCount = 2 + (index % 4);
    const statements: (BatchItem<"sqlite"> | SeedEvent)[] = [
      db.insert(business.tableSessions).values({
        id: sessionId,
        store_id: store.id,
        table_id: tableId,
        locale,
        status: "closed",
        guest_count: guestCount,
        cart_version: 18,
        opened_at: openedAt,
        closed_at: closedAt,
      }),
      event(store.id, sessionId, "table.opened", { guestCount, locale }, openedAt, true),
    ];
    let total = 0;
    for (let number = 0; number < 4; number++) {
      const at = openedAt + (number * 15 + 1) * 60_000;
      const version = number * 4 + 1;
      const line = sampleLine(store.configuration, index + number);
      line.quantity = 1 + ((index + number) % 2);
      const snapshot = snapshotFor(store, sessionId, [line], version, locale, at + 3000);
      total += snapshot.total;
      const orderId = `${snapshot.id}-order`;
      const productName = snapshot.lines[0]?.name[locale] ?? "";
      statements.push(
        event(
          store.id,
          sessionId,
          "voice.user",
          {
            role: "user",
            locale,
            status: "completed",
            speaker: syntheticSpeaker(sessionId, number % guestCount),
            text:
              locale === "ja"
                ? `${productName}について教えてください。`
                : `Could you tell us about ${productName}?`,
          },
          at,
          true,
        ),
        event(
          store.id,
          sessionId,
          "voice.assistant",
          {
            role: "assistant",
            locale,
            status: "completed",
            text:
              locale === "ja"
                ? "アレルギーや原材料についてはスタッフへご確認ください。"
                : "Please ask a member of staff about ingredients and allergies.",
          },
          at + 1000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "cart.updated",
          { cartVersion: version, lines: [line] },
          at + 2000,
          true,
        ),
        confirmation(db, store.id, snapshot, at + 3000),
        event(
          store.id,
          sessionId,
          "confirmation.prepared",
          { snapshotId: snapshot.id },
          at + 3000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "voice.assistant",
          { role: "assistant", locale, status: "completed", text: snapshot.text },
          at + 4000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "voice.user",
          {
            role: "user",
            locale,
            status: "completed",
            speaker: syntheticSpeaker(sessionId, number === 3 ? null : (number + 1) % guestCount),
            text:
              locale === "ja"
                ? "画面で確認して注文します。"
                : "I will confirm the order on screen.",
          },
          at + 5000,
          true,
        ),
        order(db, store.id, snapshot, "served", at + 6000),
        event(
          store.id,
          sessionId,
          "order.submitted",
          { orderId, total: snapshot.total },
          at + 6000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "order.status",
          { orderId, status: "accepted" },
          at + 10_000,
          true,
        ),
        event(
          store.id,
          sessionId,
          "order.status",
          { orderId, status: "served" },
          at + 16_000,
          true,
        ),
      );
    }
    statements.push(
      payment(db, store.id, sessionId, owner.userId, total, closedAt - 1000),
      event(
        store.id,
        sessionId,
        "billing.payment",
        { amount: total, reason: "合成デモの模擬支払" },
        closedAt - 1000,
        true,
      ),
      event(store.id, sessionId, "table.closed", {}, closedAt, true),
    );
    // 一セッションを一つのD1トランザクションに収め、履歴全体を巨大batchにしない。
    await insertSession(db, statements);
  }
}
