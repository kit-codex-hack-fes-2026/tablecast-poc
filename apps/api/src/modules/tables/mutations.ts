import { sql } from "drizzle-orm";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
export function voiceCondition(actor: Actor) {
  return actor.kind === "voice"
    ? sql` AND voice_state='active' AND voice_session_id=${actor.voiceSessionId ?? null} AND active_turn_id=${actor.turnId ?? null}`
    : sql``;
}

export async function notifyStore(services: ApiServices, storeId: string) {
  const db = services.db;

  const row = await db.get<{ cursor: number | null } | undefined>(
    sql`SELECT MAX(cursor) AS cursor FROM table_events WHERE store_id=${storeId}`,
  );
  try {
    await services.env.TABLECAST_EVENTS.get(
      services.env.TABLECAST_EVENTS.idFromName(storeId),
    ).notify(row?.cursor ?? 0);
  } catch {
    console.warn(JSON.stringify({ event: "tablecast.notification_failed", storeId }));
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
