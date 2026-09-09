import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { DomainError, ensure } from "../../platform/errors";
import { getVoiceConfirmation, markConfirmationRead } from "../orders/service";
import type { VoiceDiagnostics } from "./diagnostics";
import { logVoiceTurn, voiceErrorCode } from "./diagnostics";
import {
  id,
  playbackSchema,
  sessionBody,
  toolSchema,
  transcriptSchema,
  voiceTurnSchema,
} from "./model";
import { voiceActor } from "./queries";
import {
  getRealtimeConfiguration,
  getVoiceConfiguration,
  invokeVoiceTool,
  recordPlayback,
  recordTranscript,
} from "./realtime";
import { finishVoiceTurn, startVoiceTurn } from "./turns";
export const voiceRoutes = new Hono<{
  Bindings: TablecastEnv;
  Variables: ApiEnv["Variables"] & { voiceDiagnostics: VoiceDiagnostics };
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
  return c.json(await getVoiceConfiguration(c.get("services"), voiceSessionId));
});
voiceRoutes.get("/realtime", async (c) => {
  return c.json(
    await getRealtimeConfiguration(
      c.get("services"),
      id.parse(c.req.query("voiceSessionId")),
      c.req.raw.signal,
    ),
  );
});
voiceRoutes.post("/transcript", async (c) => {
  const input = transcriptSchema.parse(await c.req.json());
  return c.json(
    await recordTranscript(c.get("services"), input, c.executionCtx.waitUntil.bind(c.executionCtx)),
  );
});
voiceRoutes.post("/tools", async (c) => {
  const input = toolSchema.parse(await c.req.json());
  return c.json(
    await invokeVoiceTool(
      c.get("services"),
      input,
      c.req.raw.signal,
      c.executionCtx.waitUntil.bind(c.executionCtx),
    ),
  );
});
voiceRoutes.post("/turns", async (c) => {
  const body: unknown = await c.req.json().catch(() => {
    throw new DomainError("INVALID_INPUT", 422, "INVALID_INPUT");
  });
  const parsed = voiceTurnSchema.safeParse(body);
  ensure(parsed.success, "INVALID_INPUT", 422);
  const input = parsed.data;
  const result = await startVoiceTurn(
    c.get("services"),
    input,
    c.get("voiceDiagnostics"),
    c.req.raw.signal,
    c.executionCtx.waitUntil.bind(c.executionCtx),
  );
  if (result.kind === "skipped") return c.body(null, 204);
  if (result.kind === "realtime") return c.json({ ok: true });
  return c.newResponse(result.stream, 200, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
});
voiceRoutes.get("/confirmation", async (c) => {
  const input = sessionBody.parse(c.req.query());
  return c.json(
    await getVoiceConfirmation(
      c.get("services"),
      await voiceActor(c.get("services"), input.voiceSessionId, input.turnId),
    ),
  );
});
voiceRoutes.post("/confirmations/read", async (c) => {
  const input = sessionBody
    .extend({ snapshotId: id })
    .strict()
    .parse(await c.req.json());
  await markConfirmationRead(
    c.get("services"),
    await voiceActor(c.get("services"), input.voiceSessionId, input.turnId),
    input.snapshotId,
  );
  return c.json({ ok: true });
});
voiceRoutes.post("/turns/:turnId/end", async (c) => {
  const input = z
    .object({ voiceSessionId: id, status: z.enum(["completed", "interrupted", "failed"]) })
    .strict()
    .parse(await c.req.json());
  await finishVoiceTurn(
    c.get("services"),
    input.voiceSessionId,
    id.parse(c.req.param("turnId")),
    input.status,
  );
  return c.json({ ok: true });
});
voiceRoutes.post("/playback", async (c) => {
  const input = playbackSchema.parse(await c.req.json());
  return c.json(await recordPlayback(c.get("services"), input));
});
