import { runInDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { expect, it } from "vitest";

it.each([1005, 1006, 1015])(
  "切断イベントの予約コード%dを受けても、送信せず終了応答を完了する",
  async (code) => {
    const stub = env.TABLECAST_EVENTS.get(env.TABLECAST_EVENTS.newUniqueId());
    const response = await stub.fetch(
      new Request("http://tablecast-events/live", { headers: { Upgrade: "websocket" } }),
    );
    const socket = response.webSocket;
    if (!socket) throw new Error("WebSocketへ接続できません");
    socket.accept();
    const closed = new Promise<CloseEvent>((resolve) => {
      socket.addEventListener("close", resolve, { once: true });
    });

    await runInDurableObject(stub, (instance, state) => {
      const server = state.getWebSockets()[0];
      if (!server) throw new Error("接続中のWebSocketがありません");
      // 予約コードはwireへ送れないため、実DOの受信callback境界へ入力する。
      const close: (socket: WebSocket, receivedCode: number) => void =
        instance.webSocketClose.bind(instance);
      close(server, code);
    });

    expect((await closed).code).toBe(1000);
    expect(socket.readyState).toBe(WebSocket.CLOSED);
  },
);

it.each([
  { name: "通常の終了コード", code: 1000 },
  { name: "終了コードなし", code: undefined },
])("接続中のDOを$nameで切断すると、自動終了し再接続へ通知できる", async ({ code }) => {
  const stub = env.TABLECAST_EVENTS.get(env.TABLECAST_EVENTS.newUniqueId());
  const request = new Request("http://tablecast-events/live", {
    headers: { Upgrade: "websocket" },
  });
  const response = await stub.fetch(request);
  const socket = response.webSocket;
  if (!socket) throw new Error("WebSocketへ接続できません");
  socket.accept();
  const closed = new Promise<CloseEvent>((resolve) => {
    socket.addEventListener("close", resolve, { once: true });
  });

  socket.close(code);
  expect((await closed).wasClean).toBe(true);
  expect(socket.readyState).toBe(WebSocket.CLOSED);
  await expect
    .poll(() => runInDurableObject(stub, (_, state) => state.getWebSockets().length))
    .toBe(0);

  const reconnected = (await stub.fetch(request)).webSocket;
  if (!reconnected) throw new Error("WebSocketへ再接続できません");
  reconnected.accept();
  const notified = new Promise<string>((resolve) => {
    reconnected.addEventListener("message", (event) => resolve(String(event.data)), { once: true });
  });
  await stub.notify(42);
  expect(await notified).toBe(JSON.stringify({ cursor: 42 }));
  reconnected.close();
});
