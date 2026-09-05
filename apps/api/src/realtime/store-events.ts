import { DurableObject } from "cloudflare:workers";

export class StoreEvents extends DurableObject<TablecastEnv> {
  override async fetch(request: Request) {
    if (request.headers.get("Upgrade") !== "websocket")
      return new Response("WebSocket required", { status: 426 });
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async notify(cursor: number) {
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(JSON.stringify({ cursor }));
      } catch {
        socket.close(1011, "Reconnect");
      }
    }
  }
  override webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (message === "ping") socket.send("pong");
  }
  override webSocketClose(socket: WebSocket) {
    // 異常切断の予約コードを送信せず、採用runtimeで終了応答を完了する。
    socket.close(1000);
  }
}
