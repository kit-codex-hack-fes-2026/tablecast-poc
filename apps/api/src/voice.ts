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
import { ensure } from "./errors";
import {
  getCatalog,
  getSession,
  getVoiceConfirmation,
  markConfirmationRead,
  notifyStore,
} from "./modules/operations";
import { voiceTurnSchema } from "./schema";

const id = z.string().min(1).max(100);
const sessionBody = z.object({ voiceSessionId: id, turnId: id });
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

export const voiceRoutes = new Hono<{ Bindings: TablecastEnv }>();
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
    releaseSha: c.env.TABLECAST_RELEASE_SHA,
  });
});
voiceRoutes.post("/turns", async (c) => {
  const input = voiceTurnSchema.parse(await c.req.json());
  const actor = await voiceActor(c.env, input.voiceSessionId);
  const session = await getSession(c.env, actor);
  ensure(input.locale === session.locale, "VOICE_LOCALE_STALE", 409);
  ensure(input.messages.at(-1)?.role === "user", "USER_TURN_REQUIRED", 422);
  ensure(c.env.TABLECAST_MODEL_API_KEY && c.env.TABLECAST_MODEL, "VOICE_NOT_CONFIGURED", 503);
  const startedAt = Date.now();
  const result = await c.env.TABLECAST_DB.batch([
    c.env.TABLECAST_DB.prepare(
      "UPDATE table_sessions SET active_turn_id=? WHERE id=? AND voice_state='active' AND voice_session_id=? AND status='open' AND locale=?",
    ).bind(input.turnId, session.id, input.voiceSessionId, input.locale),
    c.env.TABLECAST_DB.prepare(
      "INSERT INTO voice_turns(id,voice_session_id,table_session_id,store_id,locale,status,started_at) SELECT ?,?,id,store_id,locale,'started',? FROM table_sessions WHERE id=? AND active_turn_id=? AND voice_state='active' AND voice_session_id=?",
    ).bind(
      input.turnId,
      input.voiceSessionId,
      startedAt,
      session.id,
      input.turnId,
      input.voiceSessionId,
    ),
    c.env.TABLECAST_DB.prepare(
      "UPDATE confirmations SET status='invalid' WHERE table_session_id=? AND channel='voice' AND status='pending' AND EXISTS(SELECT 1 FROM table_sessions WHERE id=? AND active_turn_id=?)",
    ).bind(session.id, session.id, input.turnId),
    c.env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) SELECT store_id,id,'voice.user',?,? FROM table_sessions WHERE id=? AND active_turn_id=?",
    ).bind(
      JSON.stringify({
        turnId: input.turnId,
        role: "user",
        locale: input.locale,
        text: input.messages.at(-1)?.content,
        speaker: input.speaker ?? null,
      }),
      startedAt,
      session.id,
      input.turnId,
    ),
  ]);
  ensure(result[0]?.meta.changes === 1, "VOICE_SESSION_STALE", 409);
  const currentActor = { ...actor, turnId: input.turnId };
  const cancellation = new AbortController();
  const signal = AbortSignal.any([c.req.raw.signal, cancellation.signal]);
  let generationFailed = false;
  const agent = createCastAgent(c.env, currentActor, input.locale, signal);
  const requestContext = new RequestContext<{ actor: Actor }>();
  requestContext.set("actor", currentActor);
  const output = await agent
    .stream(input.messages, {
      abortSignal: signal,
      requestContext,
      maxSteps: 8,
      onError: () => {
        generationFailed = true;
      },
      stopWhen: ({ steps }: { steps: readonly { toolCalls: readonly { toolName: string }[] }[] }) =>
        steps.some((step) =>
          step.toolCalls.some((call) => call.toolName === "prepareConfirmation"),
        ),
    })
    .catch(async (error: unknown) => {
      await finishVoiceTurn(
        c.env,
        input.voiceSessionId,
        input.turnId,
        signal.aborted ? "interrupted" : "failed",
      );
      throw error;
    });
  c.executionCtx.waitUntil(notifyStore(c.env, actor.storeId));
  const reader = output.textStream.getReader();
  const encoder = new TextEncoder();
  const response = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal.throwIfAborted();
        const next = await reader.read();
        ensure(!generationFailed, "VOICE_MODEL_FAILED", 503);
        if (next.done) {
          controller.close();
          reader.releaseLock();
          return;
        }
        await getSession(c.env, currentActor);
        controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        const status = signal.aborted ? "interrupted" : "failed";
        cancellation.abort();
        controller.error(error);
        await reader.cancel().catch(() => {});
        await finishVoiceTurn(c.env, input.voiceSessionId, input.turnId, status);
      }
    },
    async cancel(reason) {
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
) {
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "UPDATE voice_turns SET status=?,ended_at=? WHERE id=? AND voice_session_id=? AND (status='started' OR (status='completed' AND ?<>'completed'))",
    ).bind(status, Date.now(), turnId, voiceSessionId, status),
    env.TABLECAST_DB.prepare(
      "UPDATE confirmations SET status='invalid' WHERE voice_session_id=? AND created_turn_id=? AND status='pending' AND ?<>'completed'",
    ).bind(voiceSessionId, turnId, status),
    env.TABLECAST_DB.prepare(
      "UPDATE table_sessions SET active_turn_id=NULL WHERE voice_session_id=? AND active_turn_id=? AND ?<>'completed'",
    ).bind(voiceSessionId, turnId, status),
  ]);
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
    "SELECT store_id,table_session_id,locale FROM voice_turns WHERE id=? AND voice_session_id=?",
  )
    .bind(input.turnId, input.voiceSessionId)
    .first<{ store_id: string; table_session_id: string; locale: string }>();
  ensure(turn, "VOICE_TURN_NOT_FOUND", 404);
  await c.env.TABLECAST_DB.batch([
    c.env.TABLECAST_DB.prepare(
      "UPDATE voice_turns SET status=CASE WHEN status='interrupted' THEN status ELSE ? END,ended_at=? WHERE id=? AND voice_session_id=? AND status<>'failed'",
    ).bind(
      input.interrupted ? "interrupted" : "completed",
      Date.now(),
      input.turnId,
      input.voiceSessionId,
    ),
    c.env.TABLECAST_DB.prepare(
      "INSERT INTO table_events(store_id,table_session_id,kind,data_json,created_at) VALUES(?,?,'voice.assistant',?,?)",
    ).bind(
      turn.store_id,
      turn.table_session_id,
      JSON.stringify({
        turnId: input.turnId,
        role: "assistant",
        locale: turn.locale,
        text: input.text,
        interrupted: input.interrupted,
        playbackRange: input.interrupted ? "sdk-reported" : "complete",
      }),
      Date.now(),
    ),
  ]);
  await notifyStore(c.env, turn.store_id);
  return c.json({ ok: true });
});
