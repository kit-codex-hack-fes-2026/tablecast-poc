import { and, eq, sql } from "drizzle-orm";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { getSession, validateSession } from "../tables/queries";
import type { VoiceTrigger } from "./model";
export function proactiveCondition(now: number) {
  return sql`AND json_array_length(cart_json)=0 AND staff_called=0 AND coalesce((SELECT json_extract(config_json,'$.cast.proactive') FROM demo_sessions WHERE session_id=table_sessions.id),(SELECT json_extract(config_json,'$.cast.proactive') FROM stores WHERE id=table_sessions.store_id))=1 AND NOT EXISTS(SELECT 1 FROM confirmations WHERE table_session_id=table_sessions.id AND status IN ('pending','read') AND expires_at>${now})`;
}

export function proactiveReservationCondition(now: number, cooldown: number) {
  return sql`${proactiveCondition(now)} AND (active_turn_id IS NULL OR EXISTS(SELECT 1 FROM voice_turns WHERE id=active_turn_id AND status<>'started')) AND NOT EXISTS(SELECT 1 FROM table_events WHERE store_id=table_sessions.store_id AND table_session_id=table_sessions.id AND kind='voice.proactive' AND created_at>${cooldown})`;
}

export async function currentVoiceTurn(
  services: ApiServices,
  actor: Actor,
  locale: string,
  trigger: VoiceTrigger,
) {
  const db = services.db;

  const session = await getSession(services, actor);
  ensure(session.locale === locale, "VOICE_LOCALE_STALE", 409);
  if (trigger === "proactive")
    ensure(
      (
        await db.get<{ id: string | number } | undefined>(
          sql`SELECT id FROM table_sessions WHERE id=${session.id} AND active_turn_id=${actor.turnId ?? null} ${proactiveCondition(Date.now())}`,
        )
      )?.id,
      "PROACTIVE_TURN_STALE",
      409,
    );
}

export async function voiceActor(
  services: ApiServices,
  voiceSessionId: string,
  turnId?: string,
): Promise<Actor> {
  const db = services.db;

  const result = await db
    .select({ session: business.tableSessions, createdBy: business.demoSessions.created_by })
    .from(business.tableSessions)
    .leftJoin(
      business.demoSessions,
      eq(business.demoSessions.session_id, business.tableSessions.id),
    )
    .where(
      and(
        eq(business.tableSessions.voice_session_id, voiceSessionId),
        eq(business.tableSessions.voice_state, "active"),
        eq(business.tableSessions.status, "open"),
      ),
    )
    .get();
  ensure(result, "VOICE_SESSION_STALE", 409);
  const row = result.session;
  const actor: Actor = {
    kind: "voice",
    ...(row.kind === "demo"
      ? {
          demoId: row.id,
          userId: result.createdBy ?? undefined,
        }
      : {}),
    storeId: row.store_id,
    tableSessionId: row.id,
    voiceSessionId,
    ...(turnId ? { turnId } : {}),
  };
  await validateSession(services, actor, row);
  return actor;
}
