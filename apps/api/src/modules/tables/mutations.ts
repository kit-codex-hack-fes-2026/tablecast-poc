import { failureLog } from "../../platform/telemetry";
import { and, eq, exists, notExists, sql, type SQL } from "drizzle-orm";
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
  const previousSession = and(
    eq(business.voiceTurns.table_session_id, actor.tableSessionId ?? ""),
    eq(business.voiceTurns.store_id, actor.storeId),
    exists(
      db
        .select({ id: business.tableSessions.id })
        .from(business.tableSessions)
        .where(
          and(
            eq(business.tableSessions.id, actor.tableSessionId ?? ""),
            eq(business.tableSessions.store_id, actor.storeId),
            eq(business.tableSessions.mutation_id, mutation),
            sql`${business.tableSessions.voice_session_id} IS NOT ${business.voiceTurns.voice_session_id}`,
          ),
        ),
    ),
  );
  return [
    db
      .update(business.voiceTurns)
      .set({ status: "interrupted", ended_at: Date.now() })
      .where(and(previousSession, eq(business.voiceTurns.status, "started"))),
    // 応答Workerが終了していても、失効と同じbatchで画面用の終端を残す。
    voiceTurnEvent(services, and(previousSession, eq(business.voiceTurns.status, "interrupted"))),
  ] as const;
}

export function voiceTurnEvent(services: ApiServices, condition: SQL | undefined) {
  const db = services.db;
  return db.insert(business.tableEvents).select(
    db
      .select({
        cursor: sql<number>`NULL`.as("cursor"),
        store_id: business.voiceTurns.store_id,
        table_session_id: business.voiceTurns.table_session_id,
        kind: sql<string>`'voice.turn'`.as("kind"),
        data_json:
          sql<string>`json_object('turnId',${business.voiceTurns.id},'status',${business.voiceTurns.status})`.as(
            "data_json",
          ),
        created_at: sql<number>`${Date.now()}`.as("created_at"),
      })
      .from(business.voiceTurns)
      .where(
        and(
          condition,
          notExists(
            db
              .select({ cursor: business.tableEvents.cursor })
              .from(business.tableEvents)
              .where(
                and(
                  eq(business.tableEvents.table_session_id, business.voiceTurns.table_session_id),
                  eq(business.tableEvents.kind, "voice.turn"),
                  sql`json_extract(${business.tableEvents.data_json},'$.turnId')=${business.voiceTurns.id} AND json_extract(${business.tableEvents.data_json},'$.status')=${business.voiceTurns.status}`,
                ),
              ),
          ),
        ),
      ),
  );
}
