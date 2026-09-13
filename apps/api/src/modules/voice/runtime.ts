import { and, eq, isNotNull, isNull } from "drizzle-orm";
import OpenAI, { ConflictError, NotFoundError } from "openai";
import { z } from "zod";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { DomainError, ensure } from "../../platform/errors";

// 一つの委任に一つのhosted sessionを対応させ、古い取消で次の委任を止めない。
export async function cancelAgentSession(services: ApiServices, agentSessionId: string) {
  const client = new OpenAI({ apiKey: services.env.TABLECAST_MODEL_API_KEY, maxRetries: 0 });
  const signal = AbortSignal.timeout(15_000);
  let confirmed = false;
  try {
    const current = await client.beta.agents.sessions.retrieve(agentSessionId, { signal });
    confirmed = current.status === "idle" || current.status === "failed";
    if (!confirmed) {
      const events = await client.beta.agents.sessions.events.stream(agentSessionId, { signal });
      try {
        await client.beta.agents.sessions.events.create(
          agentSessionId,
          {
            events: [{ type: "agent.session.input.cancel" }],
          },
          { signal },
        );
        for await (const event of events) {
          if (
            event.type === "agent.session.idle" ||
            event.type === "agent.session.failed" ||
            ((event.type === "agent.session.turn.cancelled" ||
              event.type === "agent.session.turn.completed" ||
              event.type === "agent.session.turn.failed") &&
              !event.turn.subagent_id)
          ) {
            confirmed = true;
            break;
          }
        }
      } finally {
        events.controller.abort();
      }
    }
  } catch (error) {
    confirmed = error instanceof NotFoundError;
    if (error instanceof ConflictError) {
      const latest = await client.beta.agents.sessions.retrieve(agentSessionId, { signal });
      confirmed = latest.status === "idle" || latest.status === "failed";
    }
  }
  if (confirmed)
    await services.db
      .update(business.voiceTurns)
      .set({ agent_finished_at: Date.now() })
      .where(eq(business.voiceTurns.agent_session_id, agentSessionId));
  return confirmed;
}

const liveControlEvent = z.object({ type: z.string() });

export async function closeLiveSession(services: ApiServices, voiceSessionId: string) {
  // Workersの標準WebSocket接続を使う。Node専用wsや常駐中継は不要。
  const response = await fetch(
    `https://api.openai.com/v1/live/sessions/${encodeURIComponent(voiceSessionId)}/attach`,
    {
      headers: {
        Upgrade: "websocket",
        Authorization: `Bearer ${services.env.TABLECAST_MODEL_API_KEY}`,
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    },
  );
  if (response.status === 404 || response.status === 410) return;
  const socket = response.webSocket;
  ensure(socket, "VOICE_SESSION_STOP_FAILED", 503);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(new DomainError("VOICE_SESSION_STOP_FAILED", 503, "VOICE_SESSION_STOP_FAILED")),
        10_000,
      );
      const finish = (error?: Error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      socket.addEventListener("message", (event) => {
        // 制御イベントだけを読む。音声や字幕を停止ログに含めない。
        if (typeof event.data !== "string") return;
        try {
          const parsed = liveControlEvent.safeParse(JSON.parse(event.data));
          if (!parsed.success) return;
          if (parsed.data.type === "session.closed") finish();
          else if (parsed.data.type === "error")
            finish(new DomainError("VOICE_SESSION_STOP_FAILED", 503, "VOICE_SESSION_STOP_FAILED"));
        } catch {
          /* 不正な通知は期限付きの停止確認へ任せる。 */
        }
      });
      socket.addEventListener("error", () =>
        finish(new DomainError("VOICE_SESSION_STOP_FAILED", 503, "VOICE_SESSION_STOP_FAILED")),
      );
      socket.addEventListener("close", () =>
        finish(new DomainError("VOICE_SESSION_STOP_FAILED", 503, "VOICE_SESSION_STOP_FAILED")),
      );
      socket.accept();
      socket.send(JSON.stringify({ type: "session.close" }));
    });
  } finally {
    socket.close(1000, "TableCast voice stopped");
  }
}

export async function stopVoiceRoom(services: ApiServices, voiceSessionId: string) {
  if (!services.env.TABLECAST_MODEL_API_KEY) return;
  const pending = await services.db
    .select({ id: business.voiceTurns.agent_session_id })
    .from(business.voiceTurns)
    .where(
      and(
        eq(business.voiceTurns.voice_session_id, voiceSessionId),
        isNotNull(business.voiceTurns.agent_session_id),
        isNull(business.voiceTurns.agent_finished_at),
      ),
    );
  const outcomes = await Promise.allSettled([
    closeLiveSession(services, voiceSessionId),
    ...pending.map(async ({ id }) => {
      if (id) ensure(await cancelAgentSession(services, id), "VOICE_CANCEL_FAILED", 503);
    }),
  ]);
  const failed = outcomes.find((result) => result.status === "rejected");
  if (failed)
    throw new DomainError(
      "VOICE_SESSION_STOP_FAILED",
      503,
      "VOICE_SESSION_STOP_FAILED",
      undefined,
      { cause: failed.reason },
    );
}
