import { z } from "zod";
import { DomainError, ensure } from "../platform/errors";

const liveControlEvent = z.object({ type: z.string() });

const stopFailed = () =>
  new DomainError("VOICE_SESSION_STOP_FAILED", 503, "VOICE_SESSION_STOP_FAILED");

// DBの資格・利用量判断を持たず、外部セッションの停止確認とsocketの寿命を所有する。
export async function closeProviderLiveSession(
  voiceSessionId: string,
  apiKey: string,
): Promise<unknown> {
  const response = await fetch(
    `https://api.openai.com/v1/live/sessions/${encodeURIComponent(voiceSessionId)}/attach`,
    {
      headers: { Upgrade: "websocket", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    },
  );
  if (response.status === 404 || response.status === 410) return undefined;
  const socket = response.webSocket;
  ensure(socket, "VOICE_SESSION_STOP_FAILED", 503);
  try {
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => finish(undefined, stopFailed()), 10_000);
      const finish = (value?: unknown, error?: Error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(value);
      };
      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        try {
          const value: unknown = JSON.parse(event.data);
          const parsed = liveControlEvent.safeParse(value);
          if (!parsed.success) return;
          if (parsed.data.type === "session.closed") finish(value);
          else if (parsed.data.type === "error") finish(undefined, stopFailed());
        } catch {
          // 不正な通知は期限付きの停止確認へ任せる。
        }
      });
      socket.addEventListener("error", () => finish(undefined, stopFailed()));
      socket.addEventListener("close", () => finish(undefined, stopFailed()));
      socket.accept();
      socket.send(JSON.stringify({ type: "session.close" }));
    });
  } finally {
    socket.close(1000, "TableCast voice stopped");
  }
}
