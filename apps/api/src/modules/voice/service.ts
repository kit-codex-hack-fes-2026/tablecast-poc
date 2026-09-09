import { sql } from "drizzle-orm";
import type { z } from "zod";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import type { TableState } from "../tables/model";
import {
  eventStatement,
  interruptVoiceTurns,
  notifyStore,
  voiceCondition,
} from "../tables/mutations";
import { getSession, getTableState } from "../tables/queries";
import { speechSpeedInputSchema, voiceToolEventSchema } from "./model";
export async function setSpeechSpeed(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof speechSpeedInputSchema>,
): Promise<TableState> {
  const db = services.db;

  const parsed = speechSpeedInputSchema.safeParse(input);
  ensure(parsed.success, "INVALID_INPUT", 422);
  const session = await getSession(services, actor);
  ensure(session.status === "open", "SESSION_CLOSED");
  const mutation = crypto.randomUUID();
  const gate = voiceCondition(actor);
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({ speech_speed: parsed.data.speed, mutation_id: mutation })
      .where(sql`id=${session.id} AND store_id=${actor.storeId} AND status='open'${gate}`),
    eventStatement(services, actor, mutation, "voice.speed", parsed.data),
  ]);
  ensure(result[0]?.meta.changes === 1, "TABLE_CONFLICT");
  await notifyStore(services, actor.storeId);
  return getTableState(services, actor);
}

export async function recordVoiceEvent(
  services: ApiServices,
  actor: Actor,
  event: { kind: "voice.tool"; data: Omit<z.infer<typeof voiceToolEventSchema>, "turnId"> },
  reserve = false,
) {
  const db = services.db;

  ensure(actor.kind === "voice" && actor.turnId && actor.voiceSessionId, "VOICE_REQUIRED", 403);
  const data = voiceToolEventSchema.parse({
    ...event.data,
    turnId: actor.turnId,
  });
  const gate = voiceCondition(actor);
  const result = await db
    .insert(business.tableEvents)
    .select(
      sql`SELECT NULL,store_id,id,${event.kind},${JSON.stringify(data)},${Date.now()} FROM table_sessions WHERE id=${actor.tableSessionId} AND store_id=${actor.storeId} AND status='open'${gate} AND (${reserve ? data.state : ""}<>'running' OR NOT EXISTS(SELECT 1 FROM table_events WHERE table_session_id=${actor.tableSessionId} AND kind='voice.tool' AND json_extract(data_json,'$.toolCallId')=${data.toolCallId} AND json_extract(data_json,'$.state')='running'))`,
    );
  if (result.meta.changes === 1) await notifyStore(services, actor.storeId);
  return result.meta.changes === 1;
}

export async function setVoiceSession(
  services: ApiServices,
  actor: Actor,
  voiceSessionId: string | null,
  expectedVoiceSessionId?: string,
  expectedVoiceVersion?: number,
) {
  const db = services.db;

  const row = await getSession(services, actor);
  const mutation = crypto.randomUUID();
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({
        voice_state: voiceSessionId ? "active" : "stopped",
        voice_session_id: voiceSessionId,
        active_turn_id: null,
        voice_version: sql`voice_version+1`,
        mutation_id: mutation,
      })
      .where(
        sql`id=${row.id} AND store_id=${actor.storeId} AND status='open' AND (${expectedVoiceSessionId ?? null} IS NULL OR voice_session_id=${expectedVoiceSessionId ?? null}) AND (${expectedVoiceVersion ?? null} IS NULL OR voice_version=${expectedVoiceVersion ?? null})`,
      ),
    // GUIの確認は音声停止後も同じ表示内容に対して承認できる。
    db
      .update(business.confirmations)
      .set({ status: "invalid" })
      .where(
        sql`table_session_id=${row.id} AND channel='voice' AND status IN ('pending','read') AND EXISTS(SELECT 1 FROM table_sessions WHERE id=${row.id} AND mutation_id=${mutation})`,
      ),
    interruptVoiceTurns(services, actor, mutation),
    eventStatement(services, actor, mutation, voiceSessionId ? "voice.started" : "voice.stopped", {
      voiceSessionId: voiceSessionId ?? row.voice_session_id,
    }),
  ]);
  ensure(result[0]?.meta.changes === 1, "SESSION_STALE");
  await notifyStore(services, actor.storeId);
  return getTableState(services, actor);
}
