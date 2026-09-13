import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { validate } from "../../platform/validation";
import { voiceConversationSchema, voiceDelegationSchema, voiceStartSchema } from "./model";
import { recordConversationItems } from "./conversation";
import { startVoiceDelegation, startVoiceSession, stopVoiceSession } from "./session";

// 卓端末とデモの認証済み経路からだけ組み込む。音声用の共有bearer資格は不要。
export const voiceRoutes = new Hono<ApiEnv>()
  .use("*", bodyLimit({ maxSize: 256 * 1024 }))
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
    async (c) =>
      c.json(
        await stopVoiceSession(
          c.get("services"),
          c.get("actor"),
          c.req.valid("json").voiceSessionId,
        ),
        200,
      ),
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
    return c.newResponse(result.stream, 200, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
  });
