import { DurableObject } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { voiceUsageSessions } from "../../db/billing-schema";
import { createApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { billingEventSchema } from "./model";

export class TablecastVoiceUsage extends DurableObject<TablecastEnv> {
  private socket?: WebSocket;
  private tail: Promise<void> = Promise.resolve();
  private initialization: Promise<void>;
  constructor(ctx: DurableObjectState, env: TablecastEnv) {
    super(ctx, env);
    this.initialization = ctx.storage.get<string>("sessionId").then(async (id) => {
      if (id) await this.attachSideband(id);
    });
    ctx.waitUntil(this.initialization);
  }
  async start(sessionId: string) {
    await this.initialization;
    await this.ctx.storage.put("sessionId", sessionId);
    await this.attachSideband(sessionId);
  }
  private async attachSideband(sessionId: string) {
    const services = createApiServices(this.env);
    const row = await services.db
      .select()
      .from(voiceUsageSessions)
      .where(eq(voiceUsageSessions.id, sessionId))
      .get();
    if (!row || row.final || Date.now() - row.startedAt > 86400000) {
      this.socket?.close(1000, "TableCast usage finalized");
      this.socket = undefined;
      await this.ctx.storage.deleteAll();
      return;
    }
    if (this.socket) return;
    const key = await (await import("./credentials")).sessionCredential(services, row.credentialId);
    const response = await fetch(
      `https://api.openai.com/v1/live/sessions/${encodeURIComponent(sessionId)}/attach`,
      {
        headers: { Upgrade: "websocket", Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10000),
        redirect: "manual",
      },
    );
    if (response.status === 404 || response.status === 410) {
      await this.ctx.storage.deleteAll();
      return;
    }
    const socket = response.webSocket;
    ensure(socket, "VOICE_USAGE_UNAVAILABLE", 503);
    this.socket = socket;
    socket.addEventListener("message", (message) => {
      if (typeof message.data !== "string") return;
      // 音声・会話本文を保存せず、利用量に必要なイベントだけを処理する。
      let raw: unknown;
      try {
        raw = JSON.parse(message.data);
      } catch {
        return;
      }
      const parsed = billingEventSchema.pick({ type: true }).safeParse(raw);
      if (!parsed.success) return;
      const event = parsed.data;
      if (
        !["session.started", "session.usage.updated", "session.closed", "response.event"].includes(
          event.type ?? "",
        )
      )
        return;
      this.tail = this.tail
        .then(async () => {
          await (await import("./usage")).recordVoiceUsage(services, sessionId, raw);
          if (event.type === "session.closed") {
            await this.ctx.storage.deleteAll();
            socket.close(1000, "TableCast usage finalized");
            this.socket = undefined;
          }
        })
        .catch(async () => {
          console.error("TableCast voice usage recording failed");
          // 計測できないまま新たな課金利用を続けない。主接続の自動再開は行わない。
          try {
            socket.send(JSON.stringify({ type: "session.close" }));
          } catch {
            /* 切断済みならalarmで最終利用量を取得する。 */
          }
          await services.db
            .update(voiceUsageSessions)
            .set({ measurementFailed: true })
            .where(eq(voiceUsageSessions.id, sessionId));
          await this.ctx.storage.setAlarm(Date.now() + 60_000);
        });
      this.ctx.waitUntil(this.tail);
    });
    const disconnected = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.ctx.waitUntil(
        (async () => {
          // 直前のsession.closedを保存してから判定し、通常の終了を計測失敗にしない。
          await this.tail.catch(() => undefined);
          const result = await services.db
            .update(voiceUsageSessions)
            .set({ measurementFailed: true })
            .where(and(eq(voiceUsageSessions.id, sessionId), eq(voiceUsageSessions.final, false)));
          // 音声秒数が復旧しても、切断中のResponses利用量は再取得できたと判断しない。
          if (result.meta.changes) await this.ctx.storage.setAlarm(Date.now() + 60_000);
        })(),
      );
    };
    socket.addEventListener("close", disconnected);
    socket.addEventListener("error", disconnected);
    socket.accept();
    await this.ctx.storage.setAlarm(Date.now() + 60_000);
  }
  override async alarm() {
    await this.initialization.catch(() => undefined);
    const sessionId = await this.ctx.storage.get<string>("sessionId");
    if (!sessionId) return;
    try {
      await this.attachSideband(sessionId);
    } finally {
      if (await this.ctx.storage.get("sessionId"))
        await this.ctx.storage.setAlarm(Date.now() + 60_000);
    }
  }
}
