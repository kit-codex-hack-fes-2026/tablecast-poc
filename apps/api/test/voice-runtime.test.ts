import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";
import * as business from "../src/db/business-schema";
import { cancelAgentSession, closeLiveSession } from "../src/modules/voice/runtime";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { device, deviceToken, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());

const services = () =>
  createApiServices({ ...env, TABLECAST_MODEL_API_KEY: "tablecast-private-model-key" });

it("最初のSSE通知までHTTP応答が待機していても取消要求を送り、終端を確認する", async () => {
  await setupFixture();
  const cancellation = Promise.withResolvers<void>();
  const calls: string[] = [];
  let cancellationBody: unknown;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    if (!url.pathname.endsWith("/events")) return Response.json({ status: "in_progress" });
    if (method === "POST") {
      cancellationBody = JSON.parse(typeof init?.body === "string" ? init.body : "null");
      cancellation.resolve();
      return new Response(null, { status: 204 });
    }
    // 実HTTPと同様に、最初の通知が来るまでheadersも返さない。
    await new Promise<void>((resolve, reject) => {
      void cancellation.promise.then(resolve);
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    });
    return new Response(
      `data: ${JSON.stringify({ type: "agent.session.turn.cancelled", turn: { subagent_id: null } })}\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });
  const confirmed = await cancelAgentSession(services(), "tablecast-delayed-events");
  expect(calls).toContain("POST /v1/agents/sessions/tablecast-delayed-events/events");
  expect(cancellationBody).toEqual({ events: [{ type: "agent.session.input.cancel" }] });
  expect(confirmed).toBe(true);
});

it.each(["idle", "failed"])(
  "購読が接続する前に取消が終了しても、取得した%s状態で確認して接続を閉じる",
  async (status) => {
    await setupFixture();
    const api = services();
    await api.db.insert(business.voiceTurns).values({
      id: "tablecast-missed-terminal-turn",
      voice_session_id: "tablecast-missed-terminal-live",
      table_session_id: device.tableSessionId,
      store_id: device.storeId,
      status: "interrupted",
      started_at: 1,
      agent_session_id: "tablecast-missed-terminal-agent",
    });
    let cancelled = false;
    let subscriptionClosed = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (!url.pathname.endsWith("/events"))
        return Response.json({ status: cancelled ? status : "in_progress" });
      if (init?.method === "POST") {
        cancelled = true;
        return new Response(null, { status: 204 });
      }
      // 終端は購読の接続前に発行済みで、以後の通知はない。
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => {
            subscriptionClosed = true;
            reject(init.signal?.reason);
          },
          { once: true },
        );
      });
    });
    await expect(cancelAgentSession(api, "tablecast-missed-terminal-agent")).resolves.toBe(true);
    expect(cancelled).toBe(true);
    expect(subscriptionClosed).toBe(true);
    const row = await api.db
      .select({ finished: business.voiceTurns.agent_finished_at })
      .from(business.voiceTurns)
      .where(eq(business.voiceTurns.id, "tablecast-missed-terminal-turn"))
      .get();
    expect(typeof row?.finished).toBe("number");
  },
);

it("取消POSTが失敗した場合は待機中のSSEも閉じ、停止を成功扱いしない", async () => {
  await setupFixture();
  let subscriptionClosed = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (!url.pathname.endsWith("/events")) return Response.json({ status: "in_progress" });
    if (init?.method === "POST")
      return Response.json({ error: { message: "tablecast-cancel-failed" } }, { status: 503 });
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          subscriptionClosed = true;
          reject(init.signal?.reason);
        },
        { once: true },
      );
    });
  });
  await expect(cancelAgentSession(services(), "tablecast-rejected-cancel")).resolves.toBe(false);
  expect(subscriptionClosed).toBe(true);
});

it.each(["idle", "failed"])("取得時点で%sのAgentには取消やSSE接続を追加しない", async (status) => {
  await setupFixture();
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ status }));
  await expect(cancelAgentSession(services(), "tablecast-finished-agent")).resolves.toBe(true);
  expect(fetch).toHaveBeenCalledOnce();
});

it("Agentの終端がないEOFでは停止HTTPを503にし、生成完了をDBへ記録しない", async () => {
  await setupFixture();
  const api = services();
  const voiceSessionId = "tablecast-incomplete-stop-live";
  await setVoiceSession(api, device, voiceSessionId);
  await api.db.insert(business.voiceTurns).values({
    id: "tablecast-incomplete-stop-turn",
    voice_session_id: voiceSessionId,
    table_session_id: device.tableSessionId,
    store_id: device.storeId,
    status: "started",
    started_at: 1,
    agent_session_id: "tablecast-incomplete-stop-agent",
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith("/attach")) return new Response(null, { status: 404 });
    if (!url.pathname.endsWith("/events")) return Response.json({ status: "in_progress" });
    if (init?.method === "POST") return new Response(null, { status: 204 });
    return new Response("", { headers: { "Content-Type": "text/event-stream" } });
  });
  const context = createExecutionContext();
  const response = await app.fetch(
    new Request("http://localhost:3000/api/table/voice/stop", {
      method: "POST",
      headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ voiceSessionId }),
    }),
    { ...env, TABLECAST_MODEL_API_KEY: "tablecast-private-model-key" },
    context,
  );
  await waitOnExecutionContext(context);
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "VOICE_SESSION_STOP_FAILED" } });
  expect(
    await api.db
      .select({
        status: business.voiceTurns.status,
        finished: business.voiceTurns.agent_finished_at,
      })
      .from(business.voiceTurns)
      .where(eq(business.voiceTurns.id, "tablecast-incomplete-stop-turn"))
      .get(),
  ).toEqual({ status: "interrupted", finished: null });
});

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
