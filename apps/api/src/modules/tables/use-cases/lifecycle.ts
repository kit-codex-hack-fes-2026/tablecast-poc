import { and, eq, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Locale } from "../../../platform/model";
import type { Actor } from "../../auth/model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { observeOperation } from "../../../platform/telemetry";
import { getCatalog } from "../../catalog/queries";
import { resetCustomerContextStatements } from "../../customer-memory/context";
import { snapshotPointPolicy } from "../../customer-points/mutations";
import { stopVoiceRoom } from "../../voice/runtime";
import {
  eventStatement,
  interruptVoiceTurns,
  invalidationStatement,
  notifyStore,
} from "../mutations";
import { getTableState } from "../queries";

export async function closeTable(services: ApiServices, actor: Actor) {
  return observeOperation(
    "tablecast.table.close",
    async () => {
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
        ...resetCustomerContextStatements(
          services,
          actor.storeId,
          and(
            eq(business.tableSessions.id, actor.tableSessionId ?? ""),
            sql`EXISTS (SELECT 1 FROM customer_contexts WHERE session_id=${actor.tableSessionId})`,
          ),
          mutation,
        ),
        db
          .update(business.customerVisitParticipants)
          .set({ leftAt: Date.now() })
          .where(
            and(
              eq(business.customerVisitParticipants.sessionId, actor.tableSessionId ?? ""),
              eq(business.customerVisitParticipants.storeId, actor.storeId),
              sql`EXISTS (SELECT 1 FROM table_sessions WHERE id=${actor.tableSessionId} AND mutation_id=${mutation})`,
            ),
          ),
        invalidationStatement(services, actor, mutation),
        ...interruptVoiceTurns(services, actor, mutation),
        eventStatement(services, actor, mutation, "table.closed", {}),
      ]);
      ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
      await notifyStore(services, actor.storeId, actor.tableSessionId, {
        cursor: result[11].meta.last_row_id,
        demoId: table.kind === "demo" ? table.id : undefined,
      });
      if (table.voiceSessionId) await stopVoiceRoom(services, table.voiceSessionId);
      return getTableState(services, actor);
    },
    { env: services.env, input: { actor } },
  );
}

export async function openTable(
  services: ApiServices,
  actor: Actor,
  input: { guestCount: number; locale: Locale; planId?: string; tableId: string },
) {
  return observeOperation(
    "tablecast.table.open",
    async () => {
      const db = services.db;

      ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
      const table = await db
        .select({ id: business.restaurantTables.id })
        .from(business.restaurantTables)
        .where(
          and(
            eq(business.restaurantTables.id, input.tableId),
            eq(business.restaurantTables.store_id, actor.storeId),
          ),
        )
        .get();
      ensure(table, "TABLE_NOT_FOUND", 404);
      const catalog = await getCatalog(services, actor.storeId, actor.demoId);
      const plan = input.planId
        ? catalog.configuration.plans.find((p) => p.id === input.planId)
        : null;
      if (input.planId) ensure(plan, "PLAN_NOT_FOUND", 422);
      const now = Date.now();
      const sessionId = crypto.randomUUID();
      const result = await db.batch([
        db
          .insert(business.tableSessions)
          .select(
            sql`SELECT ${sessionId},${actor.storeId},${input.tableId},'table',${input.locale},'open',${input.guestCount},0,'[]',NULL,'stopped',NULL,0,NULL,'menu',NULL,1,0,${plan ? JSON.stringify({ id: plan.id, startedAt: now, rules: plan }) : null},${now},NULL WHERE NOT EXISTS(SELECT 1 FROM table_sessions WHERE table_id=${input.tableId} AND status='open')`,
          ),
        snapshotPointPolicy(services, actor.storeId, sessionId),
        db
          .insert(business.tableEvents)
          .select(
            sql`SELECT NULL,${actor.storeId},${sessionId},${"table.opened"},${JSON.stringify({ guestCount: input.guestCount })},${now} WHERE changes()=1`,
          ),
      ]);
      ensure(result[0]?.meta.changes === 1, "TABLE_CONFLICT");
      await notifyStore(services, actor.storeId, sessionId, { cursor: result[2].meta.last_row_id });
      return getTableState(services, { ...actor, tableSessionId: sessionId });
    },
    { env: services.env, input: { actor, input } },
  );
}
