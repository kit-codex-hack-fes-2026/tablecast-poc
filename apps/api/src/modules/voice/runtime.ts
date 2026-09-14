import { z } from "zod";
import type { ApiServices } from "../../platform/context";
import { DomainError, ensure } from "../../platform/errors";

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
  if (services.env.TABLECAST_MODEL_API_KEY) await closeLiveSession(services, voiceSessionId);
  return true;
}
