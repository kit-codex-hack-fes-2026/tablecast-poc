import type { z } from "zod";
import { sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Locale } from "../../../platform/model";
import type { Actor } from "../../auth/model";
import type { Catalog } from "../../configuration/model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { observeOperation } from "../../../platform/telemetry";
import { getCatalog, sessionConfigVersion } from "../../catalog/queries";
import { showProductsSchema } from "../../voice/model";
import { stopVoiceRoom } from "../../voice/runtime";
import { type TableState, uiSectionInputSchema } from "../model";
import {
  eventStatement,
  interruptVoiceTurns,
  invalidationStatement,
  notifyStore,
  voiceCondition,
} from "../mutations";
import { getTableState } from "../queries";
import { getSession } from "../session";

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
  const catalog = productId ? await getCatalog(services, actor.storeId, actor.demoId) : null;
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
        sql`id=${session.id} AND store_id=${actor.storeId} AND status='open'${gate} AND (${productId} IS NULL OR ${sessionConfigVersion(actor.storeId, actor.tableSessionId)}=${catalog?.version ?? null})`,
      ),
    eventStatement(services, actor, mutation, "table.ui", {
      section: parsed.data.section,
      productId,
    }),
  ]);
  ensure(result[0]?.meta.changes === 1, "TABLE_CONFLICT");
  await notifyStore(services, actor.storeId, actor.tableSessionId, {
    cursor: result[1].meta.last_row_id,
    demoId: session.kind === "demo" ? session.id : undefined,
  });
  return getTableState(services, actor);
}

export async function showProducts(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof showProductsSchema>,
  knownCatalog?: Catalog,
) {
  const db = services.db;

  ensure(actor.kind === "voice" && actor.turnId && actor.voiceSessionId, "VOICE_REQUIRED", 403);
  const parsed = showProductsSchema.safeParse(input);
  ensure(parsed.success, "INVALID_INPUT", 422);
  if (!knownCatalog) await getSession(services, actor);
  const catalog = knownCatalog ?? (await getCatalog(services, actor.storeId, actor.demoId));
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
      sql`SELECT NULL,store_id,id,'voice.products',${JSON.stringify({ turnId: actor.turnId, productIds })},${Date.now()} FROM table_sessions WHERE id=${actor.tableSessionId} AND store_id=${actor.storeId} AND status='open'${gate} AND ${sessionConfigVersion(actor.storeId, actor.tableSessionId)}=${catalog.version}`,
    );
  ensure(result.meta.changes === 1, "TABLE_CONFLICT");
  await notifyStore(services, actor.storeId, actor.tableSessionId, {
    cursor: result.meta.last_row_id,
    demoId: actor.demoId,
  });
  return { productIds };
}

export async function callStaff(services: ApiServices, actor: Actor) {
  return observeOperation(
    "tablecast.staff.call",
    async () => {
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
      await notifyStore(services, actor.storeId, actor.tableSessionId, {
        cursor: result[1].meta.last_row_id,
        demoId: row.kind === "demo" ? row.id : undefined,
      });
      return getTableState(services, actor);
    },
    { env: services.env, input: { actor } },
  );
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
    ...interruptVoiceTurns(services, actor, mutation),
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
  await notifyStore(services, actor.storeId, actor.tableSessionId, {
    cursor: Math.max(result[4].meta.last_row_id, result[5].meta.last_row_id),
    demoId: row.kind === "demo" ? row.id : undefined,
  });
  if (row.voice_session_id) await stopVoiceRoom(services, row.voice_session_id);
  // 言語変更で失効させた音声資格を再利用せず、更新を認可した同じ卓を読み直す。
  return getTableState(services, {
    ...actor,
    kind: actor.demoId ? "staff" : "device",
    userId: actor.userId,
    voiceSessionId: undefined,
    turnId: undefined,
    storeId: actor.storeId,
    tableSessionId: row.id,
  });
}

export async function requestBill(services: ApiServices, actor: Actor) {
  return observeOperation(
    "tablecast.bill.request",
    async () => {
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
      await notifyStore(services, actor.storeId, actor.tableSessionId, {
        cursor: result[1].meta.last_row_id,
        demoId: row.kind === "demo" ? row.id : undefined,
      });
      return getTableState(services, actor);
    },
    { env: services.env, input: { actor } },
  );
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
  await notifyStore(services, actor.storeId, actor.tableSessionId, {
    cursor: result[1].meta.last_row_id,
    demoId: row.kind === "demo" ? row.id : undefined,
  });
  return getTableState(services, actor);
}
