import { env } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import { closeLiveSession } from "../src/modules/voice/runtime";
import { createApiServices } from "../src/platform/context";

afterEach(() => vi.restoreAllMocks());

const services = () =>
  createApiServices({ ...env, TABLECAST_MODEL_API_KEY: "tablecast-private-model-key" });

it("Liveがsession.closedを返した場合だけWebSocket経由の停止を完了する", async () => {
  const pair = new WebSocketPair();
  const provider = pair[1];
  const received: unknown[] = [];
  provider.accept();
  provider.addEventListener("message", (event) => {
    received.push(typeof event.data === "string" ? JSON.parse(event.data) : event.data);
    provider.send(JSON.stringify({ type: "session.closed" }));
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 101, webSocket: pair[0] }),
  );
  try {
    await expect(closeLiveSession(services(), "tablecast-live-session")).resolves.toBeUndefined();
    expect(received).toEqual([{ type: "session.close" }]);
  } finally {
    provider.close(1000);
  }
});

it("正常なソケット切断でもsession.closedがなければLiveの停止を成功扱いしない", async () => {
  const pair = new WebSocketPair();
  const provider = pair[1];
  provider.accept();
  provider.addEventListener("message", () => provider.close(1000));
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(null, { status: 101, webSocket: pair[0] }),
  );
  try {
    await expect(closeLiveSession(services(), "tablecast-live-session")).rejects.toMatchObject({
      code: "VOICE_SESSION_STOP_FAILED",
      status: 503,
    });
  } finally {
    provider.close(1000);
  }
});
