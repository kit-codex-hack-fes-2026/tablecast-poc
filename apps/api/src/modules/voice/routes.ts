import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { validate } from "../../platform/validation";
import {
  toolSchema,
  voiceConversationSchema,
  voiceDelegationSchema,
  voiceStartSchema,
  voiceOpeningSchema,
  voiceSuggestionsSchema,
} from "./model";
import { ensure } from "../../platform/errors";
import { getSession } from "../tables/queries";
import { invokeVoiceTool } from "./realtime";
import { finishVoiceTurn } from "./turns";
import { recordConversationItems } from "./conversation";
import { startVoiceDelegation, startVoiceSession, stopVoiceSession } from "./session";
import { createVoiceOpening, createVoiceSuggestions } from "./guidance";

// 卓端末とデモの認証済み経路からだけ組み込む。音声用の共有bearer資格は不要。
export const voiceRoutes = new Hono<ApiEnv>()
  .use("*", bodyLimit({ maxSize: 256 * 1024 }))
  .post("/opening", validate(voiceOpeningSchema), async (c) => {
    const result = await createVoiceOpening(
      c.get("services"),
      c.get("actor"),
      c.req.valid("json").voiceSessionId,
      c.req.raw.signal,
    );
    return result ? c.json(result, 200) : c.body(null, 204);
  })
  .post("/suggestions", validate(voiceSuggestionsSchema), async (c) =>
    c.json(
      await createVoiceSuggestions(
        c.get("services"),
        c.get("actor"),
        c.req.valid("json"),
        c.req.raw.signal,
      ),
      200,
    ),
  )
  .post("/start", validate(voiceStartSchema), async (c) => {
    const started = startVoiceSession(
      c.get("services"),
      c.get("actor"),
      c.req.valid("json").sdp,
      c.req.raw.signal,
    );
    // 接続元が中断しても、発行済みLive sessionを失効させるまで待つ。
    c.executionCtx.waitUntil(started.catch(() => undefined));
    return c.json(await started, 200);
  })
  .post(
    "/stop",
    validate(z.object({ voiceSessionId: z.string().max(100).optional() }).strict()),
    async (c) => {
      const result = await stopVoiceSession(
        c.get("services"),
        c.get("actor"),
        c.req.valid("json").voiceSessionId,
      );
      return c.json(result.state, result.completed ? 200 : 202);
    },
  )
  .post("/conversation", validate(voiceConversationSchema), async (c) =>
    c.json(
      await recordConversationItems(c.get("services"), c.get("actor"), c.req.valid("json")),
      200,
    ),
  )
  .post("/delegations", validate(voiceDelegationSchema), async (c) => {
    const result = await startVoiceDelegation(
      c.get("services"),
      c.get("actor"),
      c.req.valid("json"),
      {
        traceId: c.get("traceId"),
        releaseSha: c.env.TABLECAST_RELEASE_SHA,
      },
      c.req.raw.signal,
      c.executionCtx.waitUntil.bind(c.executionCtx),
    );
    if (result.kind === "skipped") return c.body(null, 204);
    return c.json(result, 200);
  })
  .post("/tools", validate(toolSchema), async (c) => {
    const input = c.req.valid("json");
    const session = await getSession(c.get("services"), c.get("actor"));
    ensure(session.voice_session_id === input.voiceSessionId, "VOICE_SESSION_STALE", 409);
    return c.json(
      await invokeVoiceTool(
        c.get("services"),
        input,
        c.req.raw.signal,
        c.executionCtx.waitUntil.bind(c.executionCtx),
      ),
      200,
    );
  })
  .post(
    "/finish",
    validate(
      z
        .object({
          voiceSessionId: z.string().min(1).max(200),
          turnId: z.string().min(1).max(200),
          status: z.enum(["completed", "interrupted", "failed"]),
        })
        .strict(),
    ),
    async (c) => {
      const input = c.req.valid("json");
      const services = c.get("services");
      const session = await getSession(services, c.get("actor"));
      ensure(session.voice_session_id === input.voiceSessionId, "VOICE_SESSION_STALE", 409);
      await finishVoiceTurn(services, input.voiceSessionId, input.turnId, input.status);
      return c.json({ ok: true }, 200);
    },
  );
