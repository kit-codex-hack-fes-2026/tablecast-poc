import { timingSafeEqual } from "node:crypto";
import { RequestContext } from "@mastra/core/request-context";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
  RoomServiceClient,
  ServerError,
  TrackSource,
} from "livekit-server-sdk";
import { z } from "zod";
import { createCastAgent } from "./agent/cast";
import type { Actor } from "./auth";
import type { TableRecord } from "./db/records";
import { DomainError, ensure } from "./errors";
import {
  getCatalog,
  getSession,
  getVoiceConfirmation,
  markConfirmationRead,
  notifyStore,
  recordVoiceEvent,
} from "./modules/operations";
import { voiceTurnSchema, voiceToolNameSchema, type VoiceTrigger } from "./schema";

const id = z.string().min(1).max(100);
const sessionBody = z.object({ voiceSessionId: id, turnId: id });
const proactiveCondition =
  "AND json_array_length(cart_json)=0 AND staff_called=0 AND EXISTS(SELECT 1 FROM stores WHERE id=table_sessions.store_id AND json_extract(config_json,'$.cast.proactive')=1) AND NOT EXISTS(SELECT 1 FROM confirmations WHERE table_session_id=table_sessions.id AND status IN ('pending','read') AND expires_at>?)";
const proactiveReservationCondition = `${proactiveCondition} AND (active_turn_id IS NULL OR EXISTS(SELECT 1 FROM voice_turns WHERE id=active_turn_id AND status<>'started')) AND NOT EXISTS(SELECT 1 FROM table_events WHERE store_id=table_sessions.store_id AND table_session_id=table_sessions.id AND kind='voice.proactive' AND created_at>?)`;
type VoiceDiagnostics = {
  traceId: string;
  releaseSha: string;
  storeId?: string;
  tableSessionId?: string;
  voiceSessionId?: string;
  turnId?: string;
  runId?: string;
};
type VoicePhase = "accepted" | "generated" | "rejected" | "interrupted" | "failed" | "skipped";
const diagnosticCodes = new Set([
  "INVALID_INPUT",
  "VOICE_UNAUTHORIZED",
  "VOICE_SESSION_STALE",
  "VOICE_LOCALE_STALE",
  "PROACTIVE_TURN_STALE",
  "PROACTIVE_SPEAKER_FORBIDDEN",
  "USER_TURN_REQUIRED",
  "VOICE_NOT_CONFIGURED",
  "VOICE_MODEL_FAILED",
  "VOICE_CANCELLED",
]);
function voiceErrorCode(error: unknown) {
  return error instanceof DomainError && diagnosticCodes.has(error.code)
    ? error.code
    : "VOICE_INTERNAL_ERROR";
}
function logVoiceTurn(diagnostics: VoiceDiagnostics, phase: VoicePhase, code?: string) {
  console.info(
    JSON.stringify({
      event: "tablecast.voice_turn",
      operation: "turn",
      phase,
      traceId: diagnostics.traceId,
      releaseSha: diagnostics.releaseSha,
      storeId: diagnostics.storeId,
      tableSessionId: diagnostics.tableSessionId,
      voiceSessionId: diagnostics.voiceSessionId,
      turnId: diagnostics.turnId,
      runId: diagnostics.runId,
      code,
    }),
  );
}

async function currentVoiceTurn(
  env: TablecastEnv,
  actor: Actor,
  locale: string,
  trigger: VoiceTrigger,
) {
  const session = await getSession(env, actor);
  ensure(session.locale === locale, "VOICE_LOCALE_STALE", 409);
  if (trigger === "proactive")
    ensure(
      await env.TABLECAST_DB.prepare(
        `SELECT id FROM table_sessions WHERE id=? AND active_turn_id=? ${proactiveCondition}`,
      )
        .bind(session.id, actor.turnId ?? null, Date.now())
        .first("id"),
      "PROACTIVE_TURN_STALE",
      409,
    );
}
export const voiceParticipantIdentity = (voiceSessionId: string) =>
  `tablecast-device-${voiceSessionId}`;

export async function stopVoiceRoom(env: TablecastEnv, voiceSessionId: string) {
  if (
    !env.TABLECAST_LIVEKIT_URL ||
    !env.TABLECAST_LIVEKIT_API_KEY ||
    !env.TABLECAST_LIVEKIT_API_SECRET
  )
    return;
  const service = new RoomServiceClient(
    env.TABLECAST_LIVEKIT_URL,
    env.TABLECAST_LIVEKIT_API_KEY,
    env.TABLECAST_LIVEKIT_API_SECRET,
    { failover: false, requestTimeout: 5 },
  );
  try {
    await service.deleteRoom(`tablecast-${voiceSessionId}`);
  } catch (error) {
    if (error instanceof ServerError && error.code === "not_found") return;
    ensure(false, "VOICE_ROOM_STOP_FAILED", 503);
  }
}

export async function issueVoiceToken(env: TablecastEnv, voiceSessionId: string) {
  ensure(
    env.TABLECAST_LIVEKIT_URL &&
      env.TABLECAST_LIVEKIT_API_KEY &&
      env.TABLECAST_LIVEKIT_API_SECRET &&
      env.TABLECAST_VOICE_API_TOKEN &&
      env.TABLECAST_MODEL_API_KEY &&
      env.TABLECAST_MODEL,
    "VOICE_NOT_CONFIGURED",
    503,
  );
  const roomName = `tablecast-${voiceSessionId}`;
  const token = new AccessToken(env.TABLECAST_LIVEKIT_API_KEY, env.TABLECAST_LIVEKIT_API_SECRET, {
    identity: voiceParticipantIdentity(voiceSessionId),
    ttl: "10m",
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
  });
  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: "tablecast-voice",
        metadata: JSON.stringify({ voiceSessionId }),
      }),
    ],
  });
  return { url: env.TABLECAST_LIVEKIT_URL, token: await token.toJwt(), voiceSessionId };
}

async function voiceActor(
  env: TablecastEnv,
  voiceSessionId: string,
  turnId?: string,
): Promise<Actor> {
  const row = await env.TABLECAST_DB.prepare(
    "SELECT * FROM table_sessions WHERE voice_session_id=? AND voice_state='active' AND status='open'",
  )
    .bind(voiceSessionId)
    .first<TableRecord>();
  ensure(row, "VOICE_SESSION_STALE", 409);
  const actor: Actor = {
    kind: "voice",
    storeId: row.store_id,
    tableSessionId: row.id,
    voiceSessionId,
    ...(turnId ? { turnId } : {}),
  };
  await getSession(env, actor);
  return actor;
}

export const voiceRoutes = new Hono<{
  Bindings: TablecastEnv;
  Variables: { traceId: string; voiceDiagnostics: VoiceDiagnostics };
}>();
voiceRoutes.use("/turns", async (c, next) => {
  const diagnostics = { traceId: c.get("traceId"), releaseSha: c.env.TABLECAST_RELEASE_SHA };
  c.set("voiceDiagnostics", diagnostics);
  await next();
  if (c.res.status >= 400)
    logVoiceTurn(
      diagnostics,
      c.error instanceof DomainError && c.error.code === "VOICE_CANCELLED"
        ? "interrupted"
        : c.res.status >= 500
          ? "failed"
          : "rejected",
      c.res.status === 413 ? "BODY_TOO_LARGE" : voiceErrorCode(c.error),
    );
});
voiceRoutes.use("*", bodyLimit({ maxSize: 256 * 1024 }));
voiceRoutes.use("*", async (c, next) => {
  const token = c.env.TABLECAST_VOICE_API_TOKEN;
  const supplied = c.req.header("authorization") ?? "";
  const encoder = new TextEncoder();
  const expected = encoder.encode(`Bearer ${token}`);
  const actual = encoder.encode(supplied);
  ensure(
    token && actual.byteLength === expected.byteLength && timingSafeEqual(actual, expected),
    "VOICE_UNAUTHORIZED",
    401,
  );
  await next();
});
voiceRoutes.get("/config", async (c) => {
  const voiceSessionId = id.parse(c.req.query("voiceSessionId"));
  const actor = await voiceActor(c.env, voiceSessionId);
  const session = await getSession(c.env, actor);
  const catalog = await getCatalog(c.env, actor.storeId);
  ensure(catalog.configuration.cast.voice[session.locale], "VOICE_NOT_CONFIGURED", 503);
  return c.json({
    voiceSessionId,
    tableSessionId: session.id,
    participantIdentity: voiceParticipantIdentity(voiceSessionId),
    locale: session.locale,
    voice: catalog.configuration.cast.voice[session.locale],
    speechSpeed: session.speech_speed,
    proactive: catalog.configuration.cast.proactive,
    releaseSha: c.env.TABLECAST_RELEASE_SHA,
  });
});
voiceRoutes.post("/turns", async (c) => {
  const body: unknown = await c.req.json().catch(() => {
    throw new DomainError("INVALID_INPUT", 422, "INVALID_INPUT");
  });
  const parsed = voiceTurnSchema.safeParse(body);
  ensure(parsed.success, "INVALID_INPUT", 422);
  const input = parsed.data;
  const actor = await voiceActor(c.env, input.voiceSessionId);
  const diagnostics = c.get("voiceDiagnostics");
  Object.assign(diagnostics, {
    storeId: actor.storeId,
    tableSessionId: actor.tableSessionId,
    voiceSessionId: actor.voiceSessionId,
    turnId: input.turnId,
  });
  const session = await getSession(c.env, actor);
  ensure(input.locale === session.locale, "VOICE_LOCALE_STALE", 409);
  const proactive = input.trigger === "proactive";
  if (proactive) ensure(!input.speaker, "PROACTIVE_SPEAKER_FORBIDDEN", 422);
  else ensure(input.messages.at(-1)?.role === "user", "USER_TURN_REQUIRED", 422);
  const startedAt = Date.now();
  // 任意の接客は業務状態が許可するときだけモデル資格を必要とする。
  if (proactive) {
    const eligible = await c.env.TABLECAST_DB.prepare(
      `SELECT id FROM table_sessions WHERE id=? ${proactiveReservationCondition}`,
    )
      .bind(session.id, startedAt, startedAt - 180_000)
      .first("id");
    if (!eligible) {
      logVoiceTurn(diagnostics, "skipped");
      return c.body(null, 204);
    }
  }
  ensure(c.env.TABLECAST_MODEL_API_KEY && c.env.TABLECAST_MODEL, "VOICE_NOT_CONFIGURED", 503);
  const result = await c.env.TABLECAST_DB.batch([
    c.env.TABLECAST_DB.prepare(
      `UPDATE table_sessions SET active_turn_id=? WHERE id=? AND voice_state='active' AND voice_session_id=? AND status='open' AND locale=? ${proactive ? proactiveReservationCondition : ""}`,
    ).bind(
      input.turnId,
      session.id,
      input.voiceSessionId,
      input.locale,
      ...(proactive ? [startedAt, startedAt - 180_000] : []),
    ),
    c.env.TABLECAST_DB.prepare(
      "INSERT INTO voice_turns(id,voice_session_id,table_session_id,store_id,locale,status,started_at) SELECT ?,?,id,store_id,locale,'started',? FROM table_sessions WHERE id=? AND active_turn_id=? AND voice_state='active' AND voice_session_id=? AND changes()=1",
    ).bind(
      input.turnId,
      input.voiceSessionId,
      startedAt,
      session.id,
      input.turnId,
      input.voiceSessionId,
    ),
    c.env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) SELECT store_id,id,?,?,? FROM table_sessions WHERE id=? AND active_turn_id=? AND changes()=1",
    ).bind(
      proactive ? "voice.proactive" : "voice.user",
      JSON.stringify(
        proactive
          ? { turnId: input.turnId, trigger: "proactive", locale: input.locale }
          : {
              turnId: input.turnId,
              role: "user",
              locale: input.locale,
              text: input.messages.at(-1)?.content,
              speaker: input.speaker ?? null,
            },
      ),
      startedAt,
      session.id,
      input.turnId,
    ),
    c.env.TABLECAST_DB.prepare(
      "UPDATE voice_turns SET status='interrupted',ended_at=? WHERE table_session_id=? AND id<>? AND status='started' AND changes()=1",
    ).bind(startedAt, session.id, input.turnId),
    ...(!proactive
      ? [
          c.env.TABLECAST_DB.prepare(
            "UPDATE confirmations SET status='invalid' WHERE table_session_id=? AND channel='voice' AND status='pending' AND EXISTS(SELECT 1 FROM table_sessions WHERE id=? AND active_turn_id=?)",
          ).bind(session.id, session.id, input.turnId),
        ]
      : []),
  ]);
  if (proactive && result[0]?.meta.changes !== 1) {
    logVoiceTurn(diagnostics, "skipped");
    return c.body(null, 204);
  }
  ensure(result[0]?.meta.changes === 1, "VOICE_SESSION_STALE", 409);
  logVoiceTurn(diagnostics, "accepted");
  const currentActor = { ...actor, turnId: input.turnId };
  const cancellation = new AbortController();
  const signal = AbortSignal.any([c.req.raw.signal, cancellation.signal]);
  let generationFailed = false;
  const agent = createCastAgent(c.env, currentActor, input.locale, signal, input.trigger);
  const requestContext = new RequestContext<{ actor: Actor; diagnostics: VoiceDiagnostics }>();
  requestContext.set("actor", currentActor);
  requestContext.set("diagnostics", diagnostics);
  const output = await agent
    .stream(input.messages, {
      abortSignal: signal,
      requestContext,
      maxSteps: proactive ? 3 : 8,
      providerOptions: { openai: { reasoningEffort: "none" } },
      onChunk: async (chunk) => {
        if (
          chunk.type !== "tool-call" &&
          chunk.type !== "tool-result" &&
          chunk.type !== "tool-error"
        )
          return;
        signal.throwIfAborted();
        const toolName = voiceToolNameSchema.parse(chunk.payload.toolName);
        const toolCallId = id.parse(chunk.payload.toolCallId);
        // 言語変更は自身の資格を停止し、完了イベントを更新と同時に保存する。
        if (toolName === "setLanguage" && chunk.type === "tool-result") {
          const changed = await c.env.TABLECAST_DB.prepare(
            "SELECT id FROM table_sessions WHERE id=? AND store_id=? AND voice_state='stopped' AND voice_session_id IS NULL",
          )
            .bind(currentActor.tableSessionId, currentActor.storeId)
            .first("id");
          if (changed) return;
        }
        const stored = await recordVoiceEvent(c.env, currentActor, {
          kind: "voice.tool",
          data: {
            toolName,
            toolCallId,
            state:
              chunk.type === "tool-call"
                ? "running"
                : chunk.type === "tool-result"
                  ? "completed"
                  : "error",
            ...(chunk.type === "tool-error" ? { errorCode: "VOICE_TOOL_FAILED" } : {}),
          },
        });
        ensure(stored, "VOICE_SESSION_STALE", 409);
      },
      onError: () => {
        generationFailed = true;
      },
      stopWhen: ({ steps }: { steps: readonly { toolCalls: readonly { toolName: string }[] }[] }) =>
        steps.some((step) =>
          step.toolCalls.some((call) =>
            ["prepareConfirmation", "setLanguage"].includes(call.toolName),
          ),
        ),
    })
    .catch(async (error: unknown) => {
      await finishVoiceTurn(
        c.env,
        input.voiceSessionId,
        input.turnId,
        signal.aborted ? "interrupted" : "failed",
        "VOICE_MODEL_FAILED",
      );
      if (signal.aborted) throw new DomainError("VOICE_CANCELLED", 409, "VOICE_CANCELLED");
      throw error;
    });
  diagnostics.runId = output.runId;
  c.executionCtx.waitUntil(notifyStore(c.env, actor.storeId));
  const reader = output.textStream.getReader();
  const encoder = new TextEncoder();
  let streamFinished = false;
  const logStreamEnd = (phase: "generated" | "interrupted" | "failed", code?: string) => {
    if (streamFinished) return;
    streamFinished = true;
    logVoiceTurn(diagnostics, phase, code);
  };
  const response = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal.throwIfAborted();
        const next = await reader.read();
        signal.throwIfAborted();
        ensure(!generationFailed, "VOICE_MODEL_FAILED", 503);
        await currentVoiceTurn(c.env, currentActor, input.locale, input.trigger);
        if (next.done) {
          logStreamEnd("generated");
          controller.close();
          reader.releaseLock();
          return;
        }
        controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        const status =
          signal.aborted || (error instanceof DomainError && error.status === 409)
            ? "interrupted"
            : "failed";
        logStreamEnd(status, signal.aborted ? "VOICE_CANCELLED" : voiceErrorCode(error));
        cancellation.abort();
        controller.error(error);
        await reader.cancel().catch(() => {});
        await finishVoiceTurn(
          c.env,
          input.voiceSessionId,
          input.turnId,
          status,
          "VOICE_MODEL_FAILED",
        );
      }
    },
    async cancel(reason) {
      logStreamEnd("interrupted", "VOICE_CANCELLED");
      cancellation.abort();
      try {
        await reader.cancel(reason);
      } finally {
        await finishVoiceTurn(c.env, input.voiceSessionId, input.turnId, "interrupted");
      }
    },
  });
  return c.newResponse(response, 200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
});
voiceRoutes.get("/confirmation", async (c) => {
  const input = sessionBody.parse(c.req.query());
  return c.json(
    await getVoiceConfirmation(c.env, await voiceActor(c.env, input.voiceSessionId, input.turnId)),
  );
});
voiceRoutes.post("/confirmations/read", async (c) => {
  const input = sessionBody
    .extend({ snapshotId: id })
    .strict()
    .parse(await c.req.json());
  await markConfirmationRead(
    c.env,
    await voiceActor(c.env, input.voiceSessionId, input.turnId),
    input.snapshotId,
  );
  return c.json({ ok: true });
});
export async function finishVoiceTurn(
  env: TablecastEnv,
  voiceSessionId: string,
  turnId: string,
  status: "completed" | "interrupted" | "failed",
  failureCode: "VOICE_MODEL_FAILED" | "VOICE_INTERNAL_ERROR" = "VOICE_INTERNAL_ERROR",
) {
  const result = await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "UPDATE voice_turns SET status=?,ended_at=? WHERE id=? AND voice_session_id=? AND (status='started' OR (status='completed' AND ?<>'completed'))",
    ).bind(status, Date.now(), turnId, voiceSessionId, status),
    env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) SELECT store_id,id,'voice.failed',?,? FROM table_sessions WHERE voice_session_id=? AND active_turn_id=? AND voice_state='active' AND status='open' AND ?='failed' AND changes()=1",
    ).bind(
      JSON.stringify({ turnId, code: failureCode }),
      Date.now(),
      voiceSessionId,
      turnId,
      status,
    ),
    env.TABLECAST_DB.prepare(
      "UPDATE confirmations SET status='invalid' WHERE voice_session_id=? AND created_turn_id=? AND status='pending' AND ?<>'completed'",
    ).bind(voiceSessionId, turnId, status),
    env.TABLECAST_DB.prepare(
      "UPDATE table_sessions SET active_turn_id=NULL WHERE voice_session_id=? AND active_turn_id=? AND ?<>'completed'",
    ).bind(voiceSessionId, turnId, status),
  ]);
  if (result[1]?.meta.changes === 1) {
    const storeId = await env.TABLECAST_DB.prepare(
      "SELECT store_id FROM voice_turns WHERE id=? AND voice_session_id=?",
    )
      .bind(turnId, voiceSessionId)
      .first<string>("store_id");
    if (storeId) await notifyStore(env, storeId);
  }
}
voiceRoutes.post("/turns/:turnId/end", async (c) => {
  const input = z
    .object({ voiceSessionId: id, status: z.enum(["completed", "interrupted", "failed"]) })
    .strict()
    .parse(await c.req.json());
  await finishVoiceTurn(c.env, input.voiceSessionId, id.parse(c.req.param("turnId")), input.status);
  return c.json({ ok: true });
});
voiceRoutes.post("/playback", async (c) => {
  const input = sessionBody
    .extend({ text: z.string().max(10000), interrupted: z.boolean() })
    .strict()
    .parse(await c.req.json());
  const turn = await c.env.TABLECAST_DB.prepare(
    "SELECT store_id,table_session_id,locale,EXISTS(SELECT 1 FROM table_events WHERE store_id=voice_turns.store_id AND table_session_id=voice_turns.table_session_id AND kind='voice.proactive' AND json_extract(data_json,'$.turnId')=voice_turns.id) AS proactive FROM voice_turns WHERE id=? AND voice_session_id=?",
  )
    .bind(input.turnId, input.voiceSessionId)
    .first<{ store_id: string; table_session_id: string; locale: string; proactive: number }>();
  ensure(turn, "VOICE_TURN_NOT_FOUND", 404);
  const proactive = turn.proactive === 1;
  const result = await c.env.TABLECAST_DB.batch([
    c.env.TABLECAST_DB.prepare(
      `UPDATE voice_turns SET status=CASE WHEN status='interrupted' THEN status ELSE ? END,ended_at=? WHERE id=? AND voice_session_id=? AND status<>'failed' ${proactive ? `AND EXISTS(SELECT 1 FROM table_sessions WHERE id=? AND active_turn_id=? AND voice_session_id=? AND voice_state='active' AND status='open' AND locale=? ${proactiveCondition})` : ""}`,
    ).bind(
      input.interrupted ? "interrupted" : "completed",
      Date.now(),
      input.turnId,
      input.voiceSessionId,
      ...(proactive
        ? [turn.table_session_id, input.turnId, input.voiceSessionId, turn.locale, Date.now()]
        : []),
    ),
    c.env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) SELECT ?,?,'voice.assistant',?,? WHERE ?=0 OR changes()=1",
    ).bind(
      turn.store_id,
      turn.table_session_id,
      JSON.stringify({
        turnId: input.turnId,
        role: "assistant",
        trigger: proactive ? "proactive" : "user",
        locale: turn.locale,
        text: input.text,
        interrupted: input.interrupted,
        playbackRange: input.interrupted ? "sdk-reported" : "complete",
      }),
      Date.now(),
      proactive ? 1 : 0,
    ),
  ]);
  if (proactive) ensure(result[0]?.meta.changes === 1, "PROACTIVE_TURN_STALE", 409);
  await notifyStore(c.env, turn.store_id);
  return c.json({ ok: true });
});
