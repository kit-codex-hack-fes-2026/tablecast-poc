import type { PlanContext } from "@tablecast/api/bootstrap";
import type { BatchItem } from "drizzle-orm/batch";
import { confirmationText, priceCart } from "@tablecast/api/bootstrap";
import { business, type Database } from "@tablecast/api/db";
import { type CartLine, type Configuration, type Snapshot } from "@tablecast/api/schema";
import type { SeedEvent, Store } from "./types.ts";

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

export function syntheticSpeaker(sessionId: string, index: null | number) {
  const streamId = `${sessionId}-synthetic-stream`;
  return { id: index === null ? null : `${streamId}:${index}`, streamId, words: [] };
}

export function event(
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

export function sessionQueries(db: Database, statements: (BatchItem<"sqlite"> | SeedEvent)[]) {
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

export async function insertSession(db: Database, statements: (BatchItem<"sqlite"> | SeedEvent)[]) {
  const [first, ...rest] = sessionQueries(db, statements);
  if (first) await db.batch([first, ...rest]);
}

export function snapshotFor(
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
          en: plan.rules.text.en.displayName,
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

export function confirmation(db: Database, storeId: string, snapshot: Snapshot, at: number) {
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

export function order(
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

export function payment(
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
