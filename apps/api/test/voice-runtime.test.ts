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
const turnList = (status?: string) =>
  Response.json({
    data: status ? [{ id: "tablecast-root-turn", subagent_id: null, status }] : [],
    has_more: false,
    object: "list",
  });

it("最初のSSE通知までHTTP応答が待機していても取消要求を送り、終端を確認する", async () => {
  await setupFixture();
  const cancellation = Promise.withResolvers<void>();
  const calls: string[] = [];
  let cancellationBody: unknown;
  let cancelled = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}`);
    if (url.pathname.endsWith("/turns")) return turnList(cancelled ? "cancelled" : "in_progress");
    if (!url.pathname.endsWith("/events"))
      return Response.json({ status: cancelled ? "idle" : "in_progress", required_actions: [] });
    if (method === "POST") {
      cancellationBody = JSON.parse(typeof init?.body === "string" ? init.body : "null");
      cancelled = true;
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
      if (url.pathname.endsWith("/turns")) return turnList(cancelled ? "cancelled" : "in_progress");
      if (!url.pathname.endsWith("/events"))
        return Response.json({ status: cancelled ? status : "in_progress", required_actions: [] });
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
    if (url.pathname.endsWith("/turns")) return turnList("in_progress");
    if (!url.pathname.endsWith("/events"))
      return Response.json({ status: "in_progress", required_actions: [] });
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

it.each(["idle", "failed"])(
  "rootの終端と%s状態が確認済みなら取消やSSE接続を追加しない",
  async (status) => {
    await setupFixture();
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      return url.pathname.endsWith("/turns")
        ? turnList("completed")
        : Response.json({ status, required_actions: [] });
    });
    await expect(cancelAgentSession(services(), "tablecast-finished-agent")).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);

it("hosted sessionの作成応答待ちでは停止を受け付け、生成完了と区別して202を返す", async () => {
  await setupFixture();
  const api = services();
  const voiceSessionId = "tablecast-creating-stop-live";
  await setVoiceSession(api, device, voiceSessionId);
  await api.db.insert(business.voiceTurns).values({
    id: "tablecast-creating-stop-turn",
    voice_session_id: voiceSessionId,
    table_session_id: device.tableSessionId,
    store_id: device.storeId,
    status: "started",
    started_at: 1,
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    expect(url.pathname).toBe(`/v1/live/sessions/${voiceSessionId}/attach`);
    return new Response(null, { status: 404 });
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
  expect(response.status).toBe(202);
  expect(await response.json()).toMatchObject({ voiceState: "stopped", voiceSessionId: null });
  expect(
    await api.db
      .select({
        status: business.voiceTurns.status,
        finished: business.voiceTurns.agent_finished_at,
      })
      .from(business.voiceTurns)
      .where(eq(business.voiceTurns.id, "tablecast-creating-stop-turn"))
      .get(),
  ).toEqual({ status: "interrupted", finished: null });
});

it.each(["終端なし", "root終端のみ", "idleにも未処理actionあり"])(
  "%sでEOFになれば停止HTTPを503にし、生成完了をDBへ記録しない",
  async (ending) => {
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
    let cancelled = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.endsWith("/attach")) return new Response(null, { status: 404 });
      if (url.pathname.endsWith("/turns"))
        return turnList(cancelled && ending !== "終端なし" ? "cancelled" : "in_progress");
      if (!url.pathname.endsWith("/events"))
        return Response.json({
          status: cancelled && ending === "idleにも未処理actionあり" ? "idle" : "requires_action",
          required_actions: [{ type: "function_call", turn_id: "tablecast-root-turn" }],
        });
      if (init?.method === "POST") {
        cancelled = true;
        return new Response(null, { status: 204 });
      }
      return new Response(
        ending === "終端なし"
          ? ""
          : `data: ${JSON.stringify({
              type: "agent.session.turn.cancelled",
              session_id: "tablecast-incomplete-stop-agent",
              turn_id: "tablecast-root-turn",
              turn: { id: "tablecast-root-turn", subagent_id: null, status: "cancelled" },
            })}\n\n`,
        { headers: { "Content-Type": "text/event-stream" } },
      );
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
  },
);

it.each(["未作成", "queued"])(
  "初期rootが%sのidleでは成功を返さず、開始イベント後に取り消す",
  async (initial) => {
    await setupFixture();
    const api = services();
    const agentSessionId = "tablecast-late-root-agent";
    await api.db.insert(business.voiceTurns).values({
      id: "tablecast-late-root-turn",
      voice_session_id: "tablecast-late-root-live",
      table_session_id: device.tableSessionId,
      store_id: device.storeId,
      status: "interrupted",
      started_at: 1,
      agent_session_id: agentSessionId,
    });
    const connected = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
    const reconciled = Promise.withResolvers<void>();
    const encoder = new TextEncoder();
    let phase: "initial" | "active" | "cancelled" = "initial";
    let listRequests = 0;
    const cancellations: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname.endsWith("/turns")) {
        if (++listRequests === 2) reconciled.resolve();
        return turnList(
          phase === "initial"
            ? initial === "未作成"
              ? undefined
              : "queued"
            : phase === "active"
              ? "in_progress"
              : "cancelled",
        );
      }
      if (!url.pathname.endsWith("/events"))
        return Response.json({
          status: phase === "active" ? "in_progress" : "idle",
          required_actions: [],
        });
      if (init?.method === "POST") {
        cancellations.push(phase);
        phase = "cancelled";
        // 終端通知が来なくても、POST後の正本で取消完了を確認できる。
        return new Response(null, { status: 204 });
      }
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            connected.resolve(controller);
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    });
    let returned = false;
    const stopped = cancelAgentSession(api, agentSessionId).then((confirmed) => {
      returned = true;
      return confirmed;
    });
    const stream = await connected.promise;
    await reconciled.promise;
    expect(returned).toBe(false);
    expect(cancellations).toEqual([]);
    phase = "active";
    stream.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({
          type: "agent.session.turn.in_progress",
          session_id: agentSessionId,
          turn_id: "tablecast-root-turn",
          turn: { id: "tablecast-root-turn", subagent_id: null, status: "in_progress" },
        })}\n\n`,
      ),
    );
    await expect(stopped).resolves.toBe(true);
    expect(cancellations).toEqual(["active"]);
    const row = await api.db
      .select({ finished: business.voiceTurns.agent_finished_at })
      .from(business.voiceTurns)
      .where(eq(business.voiceTurns.id, "tablecast-late-root-turn"))
      .get();
    expect(typeof row?.finished).toBe("number");
  },
);

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
