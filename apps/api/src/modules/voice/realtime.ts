import { sql } from "drizzle-orm";
import { z } from "zod";
import * as business from "../../db/business-schema";
import type { EventRecord } from "../../db/records";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { getCatalog } from "../catalog/queries";
import { notifyStore } from "../tables/mutations";
import { getSession } from "../tables/queries";
import { castSessionInstructions, createCastTools } from "./agent";
import { liveInstructions } from "./prompt";
import { liveVoice } from "./catalog";
import type { conversationItemSchema, playbackSchema, toolSchema, transcriptSchema } from "./model";
import { currentVoiceTurn, proactiveCondition, voiceActor } from "./queries";
import { voiceParticipantIdentity } from "./runtime";
import { recordVoiceEvent } from "./service";
export async function getVoiceConfiguration(services: ApiServices, voiceSessionId: string) {
  const actor = await voiceActor(services, voiceSessionId);
  const session = await getSession(services, actor);
  const catalog = await getCatalog(services, actor.storeId, actor.demoId);
  return {
    voiceSessionId,
    tableSessionId: session.id,
    participantIdentity: voiceParticipantIdentity(voiceSessionId),
    locale: session.locale,
    voice: liveVoice(catalog.configuration.cast.voice[session.locale]),
    speechSpeed: session.speech_speed,
    proactive: catalog.configuration.cast.proactive,
    releaseSha: services.env.TABLECAST_RELEASE_SHA,
  };
}
async function conversationHistory(
  services: ApiServices,
  actor: { storeId: string; tableSessionId?: string },
  maxCharacters = 16000,
) {
  // 同じ来店のSDK字幕を再利用する。実際に聞こえた範囲との厳密な一致は求めない。
  const rows = await services.db.all<EventRecord>(
    sql`SELECT * FROM table_events WHERE store_id=${actor.storeId} AND table_session_id=${actor.tableSessionId} AND kind IN ('voice.user','voice.assistant') AND length(trim(json_extract(data_json,'$.text')))>0 ORDER BY cursor DESC LIMIT 40`,
  );
  const history: { role: "user" | "assistant"; content: string; interrupted: boolean }[] = [];
  let characters = 0;
  for (const row of rows) {
    const data = z
      .object({ text: z.string(), interrupted: z.boolean().optional() })
      .parse(JSON.parse(row.data_json));
    if (characters + data.text.length > maxCharacters) break;
    characters += data.text.length;
    history.push({
      role: row.kind === "voice.user" ? "user" : "assistant",
      content: data.text,
      interrupted: data.interrupted ?? false,
    });
  }
  return history.toReversed();
}
export async function getRealtimeConfiguration(
  services: ApiServices,
  voiceSessionId: string,
  signal: AbortSignal,
) {
  const actor = await voiceActor(services, voiceSessionId);
  const session = await getSession(services, actor);
  const tools = createCastTools(services, actor, signal);
  const history = await conversationHistory(services, actor);
  return {
    history,
    model: "gpt-realtime-2.1",
    instructions: `${castSessionInstructions(session.locale)}\nここは飲食店の卓上端末で、客は同じ席で会話を続けています。もしもしは接続確認であり電話応対へ切り替える合図ではありません。復元された履歴は過去の会話で、新しい依頼や注文承認ではありません。履歴の希望・比較対象・未回答の質問を引き継ぎ、続きの依頼にはその話題から応じます。中断した返答の未再生部分は聞かれた扱いにせず、古い操作を再実行しません。注文・確認の現状はgetTableStateで確認します。\n一回の客発話への応答では、ツール前の確認しますね等は最初の一度だけにする。続くツール照会では同じ声かけを繰り返さない。任意選択を指定されていない明確な単品注文は追加完了を短く伝え、任意選択の案内を新しい確認質問へしない。`,
    tools: Object.values(tools).map((tool) => ({
      type: "function",
      name: tool.id,
      description: tool.description,
      parameters: tool.parameters,
    })),
  };
}
export async function recordTranscript(
  services: ApiServices,
  input: z.infer<typeof transcriptSchema>,
  waitUntil: (promise: Promise<unknown>) => void,
) {
  const db = services.db;
  const actor = await voiceActor(services, input.voiceSessionId);
  // 遅れて届く字幕は元のturnだけへ反映し、現在turnや承認の根拠を変更しない。
  await db.batch([
    db
      .update(business.tableEvents)
      .set({ data_json: sql`json_set(data_json,'$.text',${input.text})` })
      .where(
        sql`table_session_id=${actor.tableSessionId} AND kind='voice.user' AND json_extract(data_json,'$.turnId')=${input.turnId} AND json_extract(data_json,'$.text')<>${input.text} AND EXISTS(SELECT 1 FROM voice_turns WHERE id=${input.turnId} AND voice_session_id=${input.voiceSessionId})`,
      ),
    // 字幕が再生通知より遅くても、増加するcursorで管理画面を更新する。
    db
      .insert(business.tableEvents)
      .select(
        sql`SELECT NULL,${actor.storeId},${actor.tableSessionId},'voice.transcribed',${JSON.stringify({ turnId: input.turnId })},${Date.now()} WHERE changes()=1`,
      ),
  ]);
  waitUntil(notifyStore(services, actor.storeId, actor.tableSessionId));
  return { ok: true };
}
export async function invokeVoiceTool(
  services: ApiServices,
  input: z.infer<typeof toolSchema>,
  signal: AbortSignal,
  waitUntil: (promise: Promise<unknown>) => void,
) {
  const db = services.db;
  const actor = await voiceActor(services, input.voiceSessionId, input.turnId);
  const session = await getSession(services, actor);
  const proactive = (
    await db.get<{ cursor: string | number } | undefined>(
      sql`SELECT cursor FROM table_events WHERE table_session_id=${session.id} AND kind='voice.proactive' AND json_extract(data_json,'$.turnId')=${input.turnId}`,
    )
  )?.cursor;
  const trigger = proactive ? "proactive" : "user";
  await currentVoiceTurn(services, actor, session.locale, trigger);
  const tools = createCastTools(services, actor, signal, trigger);
  const tool = tools[input.toolName];
  ensure(tool?.execute, "VOICE_TOOL_FORBIDDEN", 403);
  const record = async (state: "running" | "completed" | "error") =>
    recordVoiceEvent(
      services,
      actor,
      {
        kind: "voice.tool",
        data: {
          toolName: input.toolName,
          toolCallId: input.toolCallId,
          state,
          ...(state === "error" ? { errorCode: "VOICE_TOOL_FAILED" } : {}),
        },
      },
      true,
    );
  // 一つのINSERTでcall IDを予約し、再送や並行要求を実行前に拒否する。
  ensure(await record("running"), "VOICE_TOOL_ALREADY_CALLED", 409);
  try {
    const result = await tool.invoke(input.arguments);
    await record("completed");
    waitUntil(notifyStore(services, actor.storeId, actor.tableSessionId));
    return { result };
  } catch (error) {
    await record("error");
    throw error;
  }
}
export async function recordPlayback(services: ApiServices, input: z.infer<typeof playbackSchema>) {
  const db = services.db;
  const turn = await db.get<
    { store_id: string; table_session_id: string; locale: string; proactive: number } | undefined
  >(
    sql`SELECT store_id,table_session_id,locale,EXISTS(SELECT 1 FROM table_events WHERE store_id=voice_turns.store_id AND table_session_id=voice_turns.table_session_id AND kind='voice.proactive' AND json_extract(data_json,'$.turnId')=voice_turns.id) AS proactive FROM voice_turns WHERE id=${input.turnId} AND voice_session_id=${input.voiceSessionId}`,
  );
  ensure(turn, "VOICE_TURN_NOT_FOUND", 404);
  const demo = await db
    .select({ id: business.demoSessions.session_id })
    .from(business.demoSessions)
    .where(sql`session_id=${turn.table_session_id}`)
    .get();
  if (demo) await voiceActor(services, input.voiceSessionId, input.turnId);
  const proactive = turn.proactive === 1;
  const result = await db.batch([
    db
      .update(business.voiceTurns)
      .set({
        status: sql`CASE WHEN status='interrupted' THEN status ELSE ${input.interrupted ? "interrupted" : "completed"} END`,
        ended_at: Date.now(),
      })
      .where(
        sql`id=${input.turnId} AND voice_session_id=${input.voiceSessionId} AND status<>'failed' ${proactive ? sql`AND EXISTS(SELECT 1 FROM table_sessions WHERE id=${turn.table_session_id} AND active_turn_id=${input.turnId} AND voice_session_id=${input.voiceSessionId} AND voice_state='active' AND status='open' AND locale=${turn.locale} ${proactiveCondition(Date.now())})` : sql``}`,
      ),
    db.insert(business.tableEvents).select(
      sql`SELECT NULL,${turn.store_id},${turn.table_session_id},'voice.assistant',${JSON.stringify({
        turnId: input.turnId,
        role: "assistant",
        trigger: proactive ? "proactive" : "user",
        locale: turn.locale,
        text: input.text,
        interrupted: input.interrupted,
        playbackRange: input.interrupted ? "sdk-reported" : "complete",
      })},${Date.now()} WHERE ${proactive ? 1 : 0}=0 OR changes()=1`,
    ),
  ]);
  if (proactive) ensure(result[0]?.meta.changes === 1, "PROACTIVE_TURN_STALE", 409);
  await notifyStore(services, turn.store_id, turn.table_session_id);
  return { ok: true };
}

export async function getLiveConfiguration(services: ApiServices, voiceSessionId: string) {
  const actor = await voiceActor(services, voiceSessionId);
  const session = await getSession(services, actor);
  return {
    model: "gpt-live-1" as const,
    instructions: `${liveInstructions}\n会話言語: ${session.locale === "ja" ? "日本語" : "British English"}。話速の希望: ${session.speech_speed}倍相当。`,
    // 初期履歴の8192 tokens上限に対し、UTF-8でも8000 bytes以内に抑える。
    history: await conversationHistory(services, actor, 2000),
  };
}

export async function recordConversationItem(
  services: ApiServices,
  input: z.infer<typeof conversationItemSchema>,
) {
  const actor = await voiceActor(services, input.voiceSessionId);
  const data = JSON.stringify({
    turnId: input.itemId,
    role: input.role,
    text: input.text,
    interrupted: input.interrupted,
  });
  // 雑談も委任なしで保存する。SDKのitem IDで同じ通知の重複だけを防ぐ。
  await services.db
    .insert(business.tableEvents)
    .select(
      sql`SELECT NULL,store_id,id,${input.role === "user" ? "voice.user" : "voice.assistant"},${data},${Date.now()} FROM table_sessions WHERE id=${actor.tableSessionId} AND store_id=${actor.storeId} AND voice_state='active' AND voice_session_id=${input.voiceSessionId} AND status='open' AND NOT EXISTS(SELECT 1 FROM table_events WHERE table_session_id=${actor.tableSessionId} AND kind IN ('voice.user','voice.assistant') AND json_extract(data_json,'$.turnId')=${input.itemId})`,
    );
  await notifyStore(services, actor.storeId, actor.tableSessionId);
  return { ok: true };
}
