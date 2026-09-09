import { sql } from "drizzle-orm";
import type { z } from "zod";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Locale } from "../../platform/model";
import type { Actor } from "../auth/model";
import { getCatalog } from "../catalog/queries";
import { uiSectionInputSchema, type TableState } from "./model";
import {
  eventStatement,
  interruptVoiceTurns,
  invalidationStatement,
  notifyStore,
  voiceCondition,
} from "./mutations";
import { getSession, getTableState } from "./queries";
export async function setUiSection(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof uiSectionInputSchema>,
): Promise<TableState> {
  const db = services.db;

  const parsed = uiSectionInputSchema.safeParse(input);
  ensure(parsed.success, "INVALID_INPUT", 422);
  const session = await getSession(services, actor);
  ensure(session.status === "open", "SESSION_CLOSED");
  const productId = parsed.data.section === "menu" ? (parsed.data.productId ?? null) : null;
  const catalog = productId ? await getCatalog(services, actor.storeId) : null;
  ensure(
    !productId || catalog?.configuration.products.some((product) => product.id === productId),
    "PRODUCT_NOT_FOUND",
    422,
  );
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({
        ui_section: parsed.data.section,
        selected_product_id: productId,
        mutation_id: mutation,
      })
      .where(
        sql`id=${session.id} AND store_id=${actor.storeId} AND status='open'${gate} AND (${productId} IS NULL OR EXISTS(SELECT 1 FROM stores WHERE id=${actor.storeId} AND config_version=${catalog?.version ?? null}))`,
      ),
    eventStatement(services, actor, mutation, "table.ui", {
      section: parsed.data.section,
      productId,
    }),
  ]);
  ensure(result[0]?.meta.changes === 1, "TABLE_CONFLICT");
  await notifyStore(services, actor.storeId);
  return getTableState(services, actor);
}

export async function showProducts(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof showProductsSchema>,
) {
  const db = services.db;

  ensure(actor.kind === "voice" && actor.turnId && actor.voiceSessionId, "VOICE_REQUIRED", 403);
  const parsed = showProductsSchema.safeParse(input);
  ensure(parsed.success, "INVALID_INPUT", 422);
  await getSession(services, actor);
  const catalog = await getCatalog(services, actor.storeId);
  const productIds = [...new Set(parsed.data.productIds)];
  ensure(
    productIds.every((id) => catalog.configuration.products.some((product) => product.id === id)),
    "PRODUCT_NOT_FOUND",
    422,
  );
  const gate = voiceCondition(actor);
  const result = await db
    .insert(business.tableEvents)
    .select(
      sql`SELECT NULL,store_id,id,'voice.products',${JSON.stringify({ turnId: actor.turnId, productIds })},${Date.now()} FROM table_sessions WHERE id=${actor.tableSessionId} AND store_id=${actor.storeId} AND status='open'${gate} AND EXISTS(SELECT 1 FROM stores WHERE id=${actor.storeId} AND config_version=${catalog.version})`,
    );
  ensure(result.meta.changes === 1, "TABLE_CONFLICT");
  await notifyStore(services, actor.storeId);
  return { productIds };
}

export async function callStaff(services: ApiServices, actor: Actor) {
  const db = services.db;

  const row = await getSession(services, actor);
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({ staff_called: 1, mutation_id: mutation })
      .where(sql`id=${row.id} AND store_id=${actor.storeId} AND status='open'${gate}`),
    eventStatement(services, actor, mutation, "staff.called", { source: actor.kind }),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(services, actor.storeId);
  return getTableState(services, actor);
}

export async function changeLocale(services: ApiServices, actor: Actor, locale: Locale) {
  const db = services.db;

  const row = await getSession(services, actor);
  if (row.locale === locale) return getTableState(services, actor);
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({
        locale: locale,
        voice_state: "stopped",
        voice_session_id: null,
        active_turn_id: null,
        voice_version: sql`voice_version+1`,
        mutation_id: mutation,
      })
      .where(sql`id=${row.id} AND store_id=${actor.storeId} AND status='open'${gate}`),
    invalidationStatement(services, actor, mutation),
    interruptVoiceTurns(services, actor, mutation),
    eventStatement(services, actor, mutation, "locale.changed", { locale }),
    // このツール自身が音声資格を失効させるため、完了状態も同じ更新へ含める。
    db.insert(business.tableEvents)
      .select(sql`SELECT NULL,store_id,table_session_id,'voice.tool',json_set(data_json,'$.state','completed'),${Date.now()}
       FROM table_events WHERE store_id=${actor.storeId} AND table_session_id=${row.id} AND kind='voice.tool'
       AND json_extract(data_json,'$.turnId')=${actor.kind === "voice" ? (actor.turnId ?? null) : null} AND json_extract(data_json,'$.toolName')='setLanguage'
       AND json_extract(data_json,'$.state')='running'
       AND EXISTS(SELECT 1 FROM table_sessions WHERE id=${row.id} AND mutation_id=${mutation})`),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(services, actor.storeId);
  // 言語変更で失効させた音声資格を再利用せず、更新を認可した同じ卓を読み直す。
  return getTableState(services, {
    kind: "device",
    storeId: actor.storeId,
    tableSessionId: row.id,
  });
}

export async function requestBill(services: ApiServices, actor: Actor) {
  const db = services.db;

  const row = await getSession(services, actor);
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({ staff_called: 1, mutation_id: mutation })
      .where(sql`id=${row.id} AND store_id=${actor.storeId} AND status='open'${gate}`),
    eventStatement(services, actor, mutation, "bill.requested", {}),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(services, actor.storeId);
  return getTableState(services, actor);
}

export async function resolveCall(services: ApiServices, actor: Actor) {
  const db = services.db;

  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const row = await getSession(services, actor);
  const mutation = crypto.randomUUID();
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({ staff_called: 0, mutation_id: mutation })
      .where(sql`id=${row.id} AND store_id=${actor.storeId} AND status='open'`),
    eventStatement(services, actor, mutation, "staff.resolved", {}),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(services, actor.storeId);
  return getTableState(services, actor);
}

export async function closeTable(services: ApiServices, actor: Actor) {
  const db = services.db;

  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const table = await getTableState(services, actor);
  ensure(
    table.bill.due === 0 &&
      table.cart.lines.length === 0 &&
      table.orders.every((o) => ["served", "cancelled", "rejected"].includes(o.status)),
    "TABLE_NOT_SETTLED",
  );
  const mutation = crypto.randomUUID();
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({
        status: "closed",
        closed_at: Date.now(),
        voice_state: "stopped",
        voice_session_id: null,
        active_turn_id: null,
        voice_version: sql`voice_version+1`,
        cart_version: sql`cart_version+1`,
        mutation_id: mutation,
      })
      .where(
        sql`id=${actor.tableSessionId} AND store_id=${actor.storeId} AND status='open' AND cart_version=${table.cart.version}`,
      ),
    invalidationStatement(services, actor, mutation),
    interruptVoiceTurns(services, actor, mutation),
    eventStatement(services, actor, mutation, "table.closed", {}),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(services, actor.storeId);
  return getTableState(services, actor);
}

export async function openTable(
  services: ApiServices,
  actor: Actor,
  input: { tableId: string; guestCount: number; locale: Locale; planId?: string },
) {
  const db = services.db;

  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const table = await db.get<Record<string, unknown> | undefined>(
    sql`SELECT id FROM restaurant_tables WHERE id=${input.tableId} AND store_id=${actor.storeId}`,
  );
  ensure(table, "TABLE_NOT_FOUND", 404);
  const catalog = await getCatalog(services, actor.storeId);
  const plan = input.planId ? catalog.configuration.plans.find((p) => p.id === input.planId) : null;
  if (input.planId) ensure(plan, "PLAN_NOT_FOUND", 422);
  const now = Date.now();
  const sessionId = crypto.randomUUID();
  const result = await db.batch([
    db
      .insert(business.tableSessions)
      .select(
        sql`SELECT ${sessionId},${actor.storeId},${input.tableId},${input.locale},'open',${input.guestCount},0,'[]',NULL,'stopped',NULL,0,NULL,'menu',NULL,1,0,${plan ? JSON.stringify({ id: plan.id, startedAt: now, rules: plan }) : null},${now},NULL WHERE NOT EXISTS(SELECT 1 FROM table_sessions WHERE table_id=${input.tableId} AND status='open')`,
      ),
    db
      .insert(business.tableEvents)
      .select(
        sql`SELECT NULL,${actor.storeId},${sessionId},${"table.opened"},${JSON.stringify({ guestCount: input.guestCount })},${now} WHERE changes()=1`,
      ),
  ]);
  ensure(result[0]?.meta.changes === 1, "TABLE_CONFLICT");
  await notifyStore(services, actor.storeId);
  return getTableState(services, { ...actor, tableSessionId: sessionId });
}

import { showProductsSchema } from "../voice/model";
