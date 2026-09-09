import { sql } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { getCatalog } from "../catalog/queries";
import { getSession, getTableState } from "../tables/queries";
import { issueVoiceToken, stopVoiceRoom } from "../voice/runtime";
import { setVoiceSession } from "../voice/service";
export async function startVoiceSession(services: ApiServices, actor: Actor) {
  const row = await getSession(services, actor);
  ensure(row.voice_state !== "active", "VOICE_ALREADY_ACTIVE", 409);
  ensure(services.env.TABLECAST_VOICE_ENABLED === "true", "VOICE_NOT_CONFIGURED", 503);
  const catalog = await getCatalog(services, actor.storeId);
  ensure(catalog.configuration.cast.voice[row.locale], "VOICE_NOT_CONFIGURED", 503);
  const id = crypto.randomUUID();
  const token = await issueVoiceToken(services.env, id);
  await setVoiceSession(services, actor, id, undefined, row.voice_version);
  return { ...token, voiceSessionId: id };
}

export async function stopVoiceSession(services: ApiServices, actor: Actor, requested?: string) {
  const db = services.db;

  const row = await getSession(services, actor);
  const voiceSessionId = requested ?? row.voice_session_id;
  if (requested && requested !== row.voice_session_id) {
    const owned = await db.get<Record<string, unknown> | undefined>(
      sql`SELECT cursor FROM table_events WHERE store_id=${actor.storeId} AND table_session_id=${row.id} AND kind='voice.started' AND json_extract(data_json,'$.voiceSessionId')=${requested} LIMIT 1`,
    );
    ensure(owned, "VOICE_SESSION_NOT_FOUND", 404);
    await stopVoiceRoom(services.env, requested);
    return getTableState(services, actor);
  }
  const state = await setVoiceSession(services, actor, null, requested, row.voice_version);
  if (voiceSessionId) await stopVoiceRoom(services.env, voiceSessionId);
  return state;
}
