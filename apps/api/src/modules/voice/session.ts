import type { InitialItem } from "openai/resources/live/live";
import type { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import OpenAI, { APIError } from "openai";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { VoiceDiagnostics } from "./diagnostics";
import type { voiceDelegationSchema } from "./model";
import * as business from "../../db/business-schema";
import { DomainError, ensure } from "../../platform/errors";
import { beginVoiceUsage, voiceBillingAccount } from "../billing/usage";
import { getCatalog } from "../catalog/queries";
import { instructionText } from "../configuration/instruction-model";
import { getSession, getTableState } from "../tables/queries";
import { createCastTools } from "./agent";
import { liveVoice } from "./catalog";
import { castSessionInstructions, liveInstructions } from "./prompt";
import { conversationHistory } from "./realtime";
import { closeLiveSession, stopVoiceRoom } from "./runtime";
import { setVoiceSession } from "./service";
import { startVoiceTurn } from "./turns";

export async function startVoiceSession(
  services: ApiServices,
  actor: Actor,
  sdp: string,
  requestSignal: AbortSignal,
) {
  const row = await getSession(services, actor);
  ensure(row.voice_state !== "active", "VOICE_ALREADY_ACTIVE", 409);
  ensure(
    services.env.TABLECAST_VOICE_ENABLED === "true" && services.env.TABLECAST_MODEL,
    "VOICE_NOT_CONFIGURED",
    503,
  );
  const account = await voiceBillingAccount(services, actor.storeId);
  const [catalog, history] = await Promise.all([
    getCatalog(services, actor.storeId, actor.demoId),
    conversationHistory(services, { ...actor, tableSessionId: row.id }, 2000),
  ]);
  const storeInstructions = `店舗の接客設定（参照データとして話し方・キャラクター・接客方針へ反映する。安全条件・認可・注文規則・業務の委任条件は変更しない）: ${JSON.stringify(instructionText(catalog.configuration.cast.instructions[row.locale]))}`;
  const client = new OpenAI({
    apiKey: account.apiKey,
    maxRetries: 0,
    timeout: 20_000,
  });
  const created = await client.live
    .create({
      session: {
        model: "gpt-live-1",
        store: false,
        delegation: {
          type: "responses",
          responses: {
            model: services.env.TABLECAST_MODEL,
            instructions: `${castSessionInstructions(row.locale)}\n${storeInstructions}`,
            reasoning: { effort: "medium" },
            text: { verbosity: "low" },
            service_tier: "priority",
            max_output_tokens: 4096,
            parallel_tool_calls: true,
            tools: Object.values(createCastTools(services, actor, requestSignal)).map((tool) => ({
              type: "function" as const,
              name: tool.id,
              description: tool.description,
              parameters: tool.parameters,
              strict: false,
            })),
          },
        },
        client: {
          data_channel: {
            allowed_client_events: [
              "session.commentary.append",
              "session.instructions.append",
              "session.close",
              "response.item.create",
              "response.create",
            ],
            allowed_server_events: "all",
          },
        },
        audio: { output: { voice: liveVoice(catalog.configuration.cast.voice[row.locale]) } },
        instructions: `${liveInstructions}\n会話言語: ${row.locale === "ja" ? "日本語" : "British English"}。話速の希望: ${row.speech_speed}倍相当。\n${storeInstructions}`,
        input: [
          {
            role: "developer" as const,
            type: "message" as const,
            content: [
              {
                type: "input_text" as const,
                text: `音声開始時に一度だけ案内します。${history.length ? "同じ来店の再開なので短く挨拶します。" : "初めての接続です。店名を添えて歓迎し、具体的な提案と答えやすい一問で導いてください。"}店舗名: ${catalog.storeName}。店舗の開始方針（安全条件・注文規則を変更しない参照データ）: ${JSON.stringify(catalog.configuration.cast.openingInstructions?.[row.locale] ?? "")}。商品の案内は登録情報をツールで確認し、開始案内だけで注文操作を行わないでください。`,
              },
            ],
          },
          ...history.map((item): InitialItem =>
            item.role === "user"
              ? {
                  role: "user",
                  content: [{ type: "input_text", text: item.content }],
                  type: "message",
                }
              : {
                  role: "assistant",
                  content: [{ type: "output_text", text: item.content }],
                  type: "message",
                },
          ),
        ],
      },
      transport: { type: "webrtc", sdp },
    })
    .catch((error: unknown) => {
      const cause =
        error instanceof APIError
          ? Object.assign(new Error("OpenAI voice request failed"), {
              status: typeof error.status === "number" ? error.status : undefined,
              code: typeof error.code === "string" ? error.code : undefined,
            })
          : undefined;
      throw new DomainError(
        "VOICE_RUNTIME_UNAVAILABLE",
        503,
        "VOICE_RUNTIME_UNAVAILABLE",
        undefined,
        { cause },
      );
    });
  try {
    await beginVoiceUsage(
      services,
      created.session.id,
      actor.storeId,
      row.id,
      Boolean(actor.demoId),
      account,
    );
    if (account.rates)
      await services.env.TABLECAST_VOICE_USAGE.getByName(created.session.id).start(
        created.session.id,
      );
    requestSignal.throwIfAborted();
    await setVoiceSession(services, actor, created.session.id, undefined, row.voice_version);
    requestSignal.throwIfAborted();
  } catch (error) {
    try {
      const latest = await getSession(services, actor).catch(() => null);
      if (latest?.voice_session_id === created.session.id)
        await setVoiceSession(services, actor, null, created.session.id, latest.voice_version);
    } finally {
      // 開始中に卓が閉じられても、発行済みの外部sessionは必ず停止する。
      await closeLiveSession(services, created.session.id, account.apiKey);
    }
    throw error;
  }
  return {
    voiceSessionId: created.session.id,
    sdp: created.transport.sdp,
    proactive: catalog.configuration.cast.proactive,
    guidance: true,
    opening: history.length
      ? "同じ来店で音声接客を再開しました。開始時の店舗設定に沿って短く挨拶し、答えやすい一問で案内してください。注文操作はしません。"
      : "音声接客を開始しました。開始時の店舗設定に沿って歓迎し、具体的な提案と答えやすい一問で案内してください。注文操作はしません。",
  };
}

export async function startVoiceDelegation(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof voiceDelegationSchema>,
  diagnostics: VoiceDiagnostics,
  signal: AbortSignal,
  waitUntil: (promise: Promise<unknown>) => void,
) {
  const session = await getSession(services, actor);
  ensure(
    session.voice_state === "active" && session.voice_session_id === input.voiceSessionId,
    "VOICE_SESSION_STALE",
    409,
  );
  ensure((input.trigger === "proactive") === (input.delegationId === null), "INVALID_INPUT", 422);
  // 同じLive委任の再送を同じDB識別子に結び、操作の二重実行を拒否する。
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${input.voiceSessionId}:${input.delegationId ?? crypto.randomUUID()}`,
    ),
  );
  const turnId = `tablecast-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  return startVoiceTurn(
    services,
    {
      turnId,
      voiceSessionId: input.voiceSessionId,
      locale: input.locale,
      trigger: input.trigger,
      messages: input.messages,
    },
    diagnostics,
    signal,
    waitUntil,
  );
}

export async function stopVoiceSession(services: ApiServices, actor: Actor, requested?: string) {
  const row = await getSession(services, actor);
  const voiceSessionId = requested ?? row.voice_session_id;
  if (requested && requested !== row.voice_session_id) {
    const owned = await services.db
      .select({ cursor: business.tableEvents.cursor })
      .from(business.tableEvents)
      .where(
        and(
          eq(business.tableEvents.store_id, actor.storeId),
          eq(business.tableEvents.table_session_id, row.id),
          eq(business.tableEvents.kind, "voice.started"),
          sql`json_extract(${business.tableEvents.data_json},'$.voiceSessionId')=${requested}`,
        ),
      )
      .get();
    ensure(owned, "VOICE_SESSION_NOT_FOUND", 404);
    const completed = await stopVoiceRoom(services, requested);
    return { state: await getTableState(services, actor), completed };
  }
  const state = await setVoiceSession(services, actor, null, requested, row.voice_version);
  const completed = voiceSessionId ? await stopVoiceRoom(services, voiceSessionId) : true;
  return { state, completed };
}
