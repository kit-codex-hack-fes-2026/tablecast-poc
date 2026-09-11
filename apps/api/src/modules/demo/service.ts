import { and, eq, sql } from "drizzle-orm";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { requireManager } from "../auth/policy";
import { getCatalog } from "../catalog/queries";
import { configurationErrors } from "../catalog/pricing";
import { configurationSchema } from "../configuration/model";
import { getDraft } from "../configuration/service";
import {
  eventStatement,
  interruptVoiceTurns,
  invalidationStatement,
  notifyStore,
} from "../tables/mutations";
import { tablePlanSchema } from "../tables/model";
import { stopVoiceRoom } from "../voice/runtime";
import type { DemoUpdate } from "./model";
import { getDemo, getDemoRecord } from "./queries";

export async function createDemo(services: ApiServices, actor: Actor) {
  requireManager(actor);
  ensure(actor.userId, "LOGIN_REQUIRED", 401);
  const catalog = await getCatalog(services, actor.storeId);
  const id = crypto.randomUUID();
  await services.db.batch([
    services.db.insert(business.tableSessions).values({
      id,
      store_id: actor.storeId,
      kind: "demo",
      table_id: null,
      locale: "ja",
      guest_count: 1,
      opened_at: Date.now(),
    }),
    services.db.insert(business.demoSessions).values({
      session_id: id,
      created_by: actor.userId,
      source_version: catalog.version,
      config_json: JSON.stringify(catalog.configuration),
    }),
  ]);
  return getDemo(services, { ...actor, tableSessionId: id, demoId: id });
}

export async function updateDemo(services: ApiServices, actor: Actor, input: DemoUpdate) {
  const { db } = services;
  const { demo, session } = await getDemoRecord(services, actor);
  ensure(input.expectedVersion === demo.config_version, "DEMO_CONFLICT");
  const sourceId = input.sourceDraftId === undefined ? demo.source_draft_id : input.sourceDraftId;
  const reload = input.reload || input.sourceDraftId !== undefined;
  let configuration = configurationSchema.parse(JSON.parse(demo.config_json));
  let sourceVersion = demo.source_version;
  if (reload) {
    if (sourceId) {
      const draft = await getDraft(services, actor, sourceId);
      ensure(["draft", "ready"].includes(draft.status), "DRAFT_NOT_FOUND", 404);
      configuration = draft.configuration;
      sourceVersion = draft.version;
    } else {
      const catalog = await getCatalog(services, actor.storeId);
      configuration = catalog.configuration;
      sourceVersion = catalog.version;
    }
  }
  if (input.proactive !== undefined) configuration.cast.proactive = input.proactive;
  const errors = configurationErrors(configuration);
  ensure(!errors.length, "DEMO_CONFIGURATION_INVALID", 422, errors);
  const previousPlan = session.plan_json
    ? tablePlanSchema.parse(JSON.parse(session.plan_json))
    : null;
  const planId = input.planId === undefined ? previousPlan?.id : input.planId;
  const plan = configuration.plans.find((item) => item.id === planId);
  if (input.planId !== undefined && input.planId !== null) ensure(plan, "PLAN_NOT_FOUND", 422);
  const planJson = plan
    ? JSON.stringify({
        id: plan.id,
        rules: plan,
        startedAt: plan.id === previousPlan?.id ? previousPlan.startedAt : Date.now(),
      })
    : null;
  const mutation = crypto.randomUUID();
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({
        plan_json: planJson,
        guest_count: input.guestCount ?? session.guest_count,
        voice_state: "stopped",
        voice_session_id: null,
        active_turn_id: null,
        voice_version: sql`voice_version+1`,
        cart_version: sql`cart_version+1`,
        mutation_id: mutation,
      })
      .where(
        sql`id=${session.id} AND store_id=${actor.storeId} AND kind='demo' AND cart_version=${session.cart_version} AND voice_version=${session.voice_version} AND EXISTS(SELECT 1 FROM demo_sessions WHERE session_id=${session.id} AND config_version=${input.expectedVersion})`,
      ),
    db
      .update(business.demoSessions)
      .set({
        config_json: JSON.stringify(configuration),
        config_version: input.expectedVersion + 1,
        source_draft_id: sourceId,
        source_version: sourceVersion,
      })
      .where(
        sql`session_id=${session.id} AND EXISTS(SELECT 1 FROM table_sessions WHERE id=${session.id} AND mutation_id=${mutation})`,
      ),
    invalidationStatement(services, actor, mutation),
    interruptVoiceTurns(services, actor, mutation),
    eventStatement(services, actor, mutation, "demo.updated", {}),
  ]);
  ensure(result[0]?.meta.changes === 1, "DEMO_CONFLICT");
  await notifyStore(services, actor.storeId, session.id);
  if (session.voice_session_id) await stopVoiceRoom(services.env, session.voice_session_id);
  return getDemo(services, actor);
}

export async function resetDemo(services: ApiServices, actor: Actor, expectedVersion: number) {
  const { db } = services;
  const { demo, session } = await getDemoRecord(services, actor);
  ensure(demo.config_version === expectedVersion, "DEMO_CONFLICT");
  const mutation = crypto.randomUUID();
  const guard = sql`EXISTS(SELECT 1 FROM table_sessions WHERE id=${session.id} AND mutation_id=${mutation})`;
  const plan = session.plan_json ? tablePlanSchema.parse(JSON.parse(session.plan_json)) : null;
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({
        cart_json: "[]",
        cart_version: sql`cart_version+1`,
        voice_state: "stopped",
        voice_session_id: null,
        voice_version: sql`voice_version+1`,
        active_turn_id: null,
        staff_called: 0,
        ui_section: "menu",
        selected_product_id: null,
        opened_at: Date.now(),
        mutation_id: mutation,
        plan_json: plan ? JSON.stringify({ ...plan, startedAt: Date.now() }) : null,
      })
      .where(
        sql`id=${session.id} AND kind='demo' AND cart_version=${session.cart_version} AND voice_version=${session.voice_version} AND EXISTS(SELECT 1 FROM demo_sessions WHERE session_id=${session.id} AND config_version=${expectedVersion})`,
      ),
    ...[
      business.payments,
      business.orders,
      business.confirmations,
      business.voiceTurns,
      business.tableEvents,
    ].map((table) => db.delete(table).where(and(eq(table.table_session_id, session.id), guard))),
    db
      .update(business.demoSessions)
      .set({ config_version: sql`config_version+1` })
      .where(and(eq(business.demoSessions.session_id, session.id), guard)),
    eventStatement(services, actor, mutation, "demo.reset", {}),
  ]);
  ensure(result[0]?.meta.changes === 1, "DEMO_CONFLICT");
  await notifyStore(services, actor.storeId, session.id);
  if (session.voice_session_id) await stopVoiceRoom(services.env, session.voice_session_id);
  return getDemo(services, actor);
}
