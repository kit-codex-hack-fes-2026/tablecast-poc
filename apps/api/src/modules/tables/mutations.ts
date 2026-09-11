import { failureLog } from "../../platform/telemetry";
import { and, eq, sql } from "drizzle-orm";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
export function voiceCondition(actor: Actor) {
  return actor.kind === "voice"
    ? sql` AND voice_state='active' AND voice_session_id=${actor.voiceSessionId ?? null} AND active_turn_id=${actor.turnId ?? null}`
    : sql``;
}

export async function notifyStore(services: ApiServices, storeId: string, sessionId?: string) {
  const db = services.db;

  try {
    const demo = sessionId
      ? await db
          .select({ id: business.tableSessions.id })
          .from(business.tableSessions)
          .where(
            and(
              eq(business.tableSessions.id, sessionId),
              eq(business.tableSessions.store_id, storeId),
              eq(business.tableSessions.kind, "demo"),
            ),
          )
          .get()
      : undefined;
    const row = await db.get<{ cursor: number | null } | undefined>(
      sql`SELECT MAX(cursor) AS cursor FROM table_events WHERE store_id=${storeId} AND ${demo ? sql`table_session_id=${demo.id}` : sql`(table_session_id IS NULL OR table_session_id IN (SELECT id FROM table_sessions WHERE kind='table'))`}`,
    );
    await services.env.TABLECAST_EVENTS.get(
      services.env.TABLECAST_EVENTS.idFromName(demo ? `tablecast-demo-${demo.id}` : storeId),
    ).notify(row?.cursor ?? 0);
  } catch (error) {
    failureLog("tablecast.notification_failed", error, services.env, {
      "tablecast.request.id": services.requestId,
    });
  }
}

export function eventStatement(
  services: ApiServices,
  actor: Actor,
  mutation: string,
  kind: string,
  data: unknown,
) {
  const db = services.db;

  return db
    .insert(business.tableEvents)
    .select(
      sql`SELECT NULL,store_id,id,${kind},${JSON.stringify(data)},${Date.now()} FROM table_sessions WHERE id=${actor.tableSessionId} AND store_id=${actor.storeId} AND mutation_id=${mutation}`,
    );
}

export function invalidationStatement(services: ApiServices, actor: Actor, mutation: string) {
  const db = services.db;

  return db
    .update(business.confirmations)
    .set({ status: "invalid" })
    .where(
      sql`table_session_id=${actor.tableSessionId} AND status IN ('pending','read') AND EXISTS (SELECT 1 FROM table_sessions WHERE id=${actor.tableSessionId} AND mutation_id=${mutation})`,
    );
}

export function interruptVoiceTurns(services: ApiServices, actor: Actor, mutation: string) {
  const db = services.db;

  return db
    .update(business.voiceTurns)
    .set({ status: "interrupted", ended_at: Date.now() })
    .where(
      sql`table_session_id=${actor.tableSessionId} AND store_id=${actor.storeId} AND status='started' AND EXISTS(SELECT 1 FROM table_sessions s WHERE s.id=${actor.tableSessionId} AND s.mutation_id=${mutation} AND s.voice_session_id IS NOT voice_turns.voice_session_id)`,
    );
}
