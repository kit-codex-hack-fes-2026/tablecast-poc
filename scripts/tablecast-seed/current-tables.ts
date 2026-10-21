import type { BatchItem } from "drizzle-orm/batch";
import { business, type Database } from "@tablecast/api/db";
import { and, eq, inArray, or } from "drizzle-orm";
import type { Owner, SeedEvent, Store } from "./types.ts";
import {
  confirmation,
  event,
  order,
  payment,
  sampleLine,
  sessionQueries,
  snapshotFor,
  syntheticSpeaker,
} from "./session.ts";

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
          text: `${product.text[locale].displayName}${locale === "ja" ? "。" : ". "}${product.text[locale].description}`,
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
              : `There is one ${product.text.en.displayName} in your basket. The order has not been sent yet.`,
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
