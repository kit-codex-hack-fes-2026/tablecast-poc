import { ensure } from "../platform/errors";

// sidebandのACKを確認する。更新失敗でも既存の音声sessionは閉じない。
export async function updateProviderLiveSession(
  voiceSessionId: string,
  apiKey: string,
  instructions: string,
  language: string,
) {
  const response = await fetch(
    `https://api.openai.com/v1/live/sessions/${encodeURIComponent(voiceSessionId)}/attach`,
    {
      headers: { Upgrade: "websocket", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
      redirect: "manual",
    },
  );
  const socket = response.webSocket;
  ensure(socket, "VOICE_CONFIGURATION_UPDATE_FAILED", 503);
  const updateId = crypto.randomUUID();
  const languageId = crypto.randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      const pending = new Set<string>([updateId, languageId]);
      const finish = (error?: Error) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const failed = () => finish(new Error("Live session update was not acknowledged"));
      const timer = setTimeout(failed, 10_000);
      socket.addEventListener("message", ({ data }) => {
        if (typeof data !== "string") return;
        try {
          const event: unknown = JSON.parse(data);
          if (!event || typeof event !== "object" || !("type" in event)) return;
          if (event.type === "error") failed();
          else if (
            (event.type === "session.updated" || event.type === "session.instructions.appended") &&
            "client_event_id" in event &&
            typeof event.client_event_id === "string"
          ) {
            pending.delete(event.client_event_id);
            if (pending.size === 0) finish();
          }
        } catch {
          /* 不正イベントはACKにしない。 */
        }
      });
      socket.addEventListener("error", failed);
      socket.addEventListener("close", failed);
      socket.accept();
      socket.send(
        JSON.stringify({
          type: "session.update",
          event_id: updateId,
          session: { delegation: { type: "responses", responses: { instructions } } },
        }),
      );
      socket.send(
        JSON.stringify({
          type: "session.instructions.append",
          event_id: languageId,
          delegation_id: null,
          content: language,
        }),
      );
    });
  } finally {
    socket.close(1000, "TableCast language updated");
  }
}
