import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";
import { getTableState } from "../src/modules/tables/queries";
import { getEvents } from "../src/modules/stores/queries";
import { recordConversationItems } from "../src/modules/voice/conversation";
import { setVoiceSession } from "../src/modules/voice/service";
import { startVoiceSession } from "../src/modules/voice/session";
import { createApiServices } from "../src/platform/context";
import { device, deviceToken, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const configured = () => ({
  ...env,
  TABLECAST_VOICE_ENABLED: "true",
  TABLECAST_MODEL_API_KEY: "tablecast-private-model-key",
  TABLECAST_MODEL: "gpt-5.6-luna",
});
const startRequest = () =>
  new Request("http://localhost:3000/api/table/voice/start", {
    method: "POST",
    headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sdp: "tablecast-sdp-offer" }),
  });

it("認証した卓だけにLiveのSDPを返し、サーバー資格を渡さない", async () => {
  await setupFixture();
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    expect(url instanceof Request ? url.url : url.toString()).toBe(
      "https://api.openai.com/v1/live/sessions",
    );
    if (typeof init?.body !== "string") throw new Error("Liveの開始本文がない");
    expect(JSON.parse(init.body)).toMatchObject({
      session: { model: "gpt-live-1", store: false, delegation: { type: "client" } },
      transport: { type: "webrtc", sdp: "tablecast-sdp-offer" },
    });
    return Response.json({
      session: { id: "tablecast-live-created" },
      transport: { type: "webrtc", sdp: "tablecast-sdp-answer" },
    });
  });
  const ctx = createExecutionContext();
  const response = await app.request(startRequest(), undefined, configured(), ctx);
  expect(response.status).toBe(200);
  const body = await response.text();
  expect(JSON.parse(body)).toMatchObject({
    voiceSessionId: "tablecast-live-created",
    sdp: "tablecast-sdp-answer",
  });
  expect(body).not.toContain("tablecast-private-model-key");
  expect(provider).toHaveBeenCalledTimes(1);
  expect((await getTableState(createApiServices(env), device)).voiceSessionId).toBe(
    "tablecast-live-created",
  );
  await waitOnExecutionContext(ctx);
});

it("認証なしのブラウザーは音声開始と委任を実行できない", async () => {
  const provider = vi.spyOn(globalThis, "fetch");
  for (const path of ["start", "delegations", "conversation"]) {
    const response = await exports.default.fetch(`http://localhost:3000/api/table/voice/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(401);
  }
  expect(provider).not.toHaveBeenCalled();
});

it("別の音声sessionを指定した字幕保存と委任は卓の認可で拒否する", async () => {
  await setupFixture();
  await setVoiceSession(createApiServices(env), device, "tablecast-owned-live");
  const provider = vi.spyOn(globalThis, "fetch");
  for (const [path, body] of [
    [
      "conversation",
      {
        voiceSessionId: "tablecast-other-live",
        items: [{ itemId: "tablecast-caption", role: "user", text: "お茶" }],
      },
    ],
    [
      "delegations",
      {
        voiceSessionId: "tablecast-other-live",
        delegationId: "tablecast-delegation",
        locale: "ja",
        messages: [{ role: "user", content: "お茶" }],
      },
    ],
  ] as const) {
    const response = await exports.default.fetch(`http://localhost:3000/api/table/voice/${path}`, {
      method: "POST",
      headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(409);
  }
  expect(provider).not.toHaveBeenCalled();
});

it("遅着した字幕batchは保存済みの長い字幕を短くせず同じ行を更新する", async () => {
  await setupFixture();
  const services = createApiServices(env);
  await setVoiceSession(services, device, "tablecast-caption-live");
  const item = { itemId: "tablecast-caption", role: "assistant" as const, interrupted: false };
  await recordConversationItems(services, device, {
    voiceSessionId: "tablecast-caption-live",
    items: [{ ...item, text: "お茶" }],
  });
  const beforeUpdate = await getEvents(services, device, 0);
  for (const text of ["お茶をご用意します", "お茶をご"]) {
    await recordConversationItems(services, device, {
      voiceSessionId: "tablecast-caption-live",
      items: [{ ...item, text }],
    });
  }
  const captions = (await getTableState(services, device)).events.filter(
    (event) => event.kind === "voice.assistant",
  );
  expect(captions).toHaveLength(1);
  expect(captions[0]?.data).toMatchObject({
    turnId: "tablecast-caption",
    text: "お茶をご用意します",
    locale: "ja",
  });
  const changes = await getEvents(services, device, beforeUpdate.cursor);
  expect(changes.events).toMatchObject([
    { kind: "voice.transcribed", data: { turnId: "tablecast-caption" } },
  ]);
  expect(changes.cursor).toBeGreaterThan(beforeUpdate.cursor);
  await setVoiceSession(services, device, null);
  await expect(
    recordConversationItems(services, device, {
      voiceSessionId: "tablecast-caption-live",
      items: [{ ...item, text: "停止後の字幕" }],
    }),
  ).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
});

it("開始要求が中断されたら発行済みのLiveを閉じて卓をactiveにしない", async () => {
  await setupFixture();
  const cancellation = new AbortController();
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (
      (url instanceof Request ? url.url : url.toString()) ===
      "https://api.openai.com/v1/live/sessions"
    ) {
      cancellation.abort();
      return Response.json({
        session: { id: "tablecast-aborted-live" },
        transport: { type: "webrtc", sdp: "tablecast-answer" },
      });
    }
    expect(url instanceof Request ? url.url : url.toString()).toBe(
      "https://api.openai.com/v1/live/sessions/tablecast-aborted-live/attach",
    );
    return new Response(null, { status: 404 });
  });
  await expect(
    startVoiceSession(
      createApiServices(configured()),
      device,
      "tablecast-offer",
      cancellation.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(provider).toHaveBeenCalledTimes(2);
  expect((await getTableState(createApiServices(env), device)).voiceState).toBe("stopped");
});
