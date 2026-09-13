import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";
import * as business from "../src/db/business-schema";
import { updateCart } from "../src/modules/orders/service";
import { changeLocale } from "../src/modules/tables/service";
import { getTableState } from "../src/modules/tables/queries";
import { getEvents } from "../src/modules/stores/queries";
import { recordConversationItems } from "../src/modules/voice/conversation";
import { setVoiceSession } from "../src/modules/voice/service";
import { startVoiceSession } from "../src/modules/voice/session";
import { finishVoiceTurn } from "../src/modules/voice/turns";
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

it.each(["停止", "言語変更", "新しい音声session"])(
  "応答Workerが消えても%sで旧turnの終端を一度だけ残し、カートを維持する",
  async (operation) => {
    await setupFixture();
    const services = createApiServices(env);
    const voiceSessionId = "tablecast-lost-worker-live";
    await setVoiceSession(services, device, voiceSessionId);
    const before = await updateCart(services, device, {
      expectedVersion: 0,
      lines: [{ id: "tablecast-tea", productId: "tea", quantity: 1, selections: [] }],
    });
    await services.db.insert(business.voiceTurns).values(
      (["started", "interrupted", "completed"] as const).map((status) => ({
        id: `tablecast-lost-${status}`,
        voice_session_id: voiceSessionId,
        table_session_id: device.tableSessionId,
        store_id: device.storeId,
        status,
        started_at: 1,
        ended_at: status === "started" ? null : 2,
      })),
    );
    if (operation === "言語変更") await changeLocale(services, device, "en");
    else
      await setVoiceSession(
        services,
        device,
        operation === "停止" ? null : "tablecast-replacement-live",
      );
    const after = await getTableState(services, device);
    expect(after.cart).toEqual(before.cart);
    const terminal = after.events.filter((event) => event.kind === "voice.turn");
    expect(terminal).toHaveLength(2);
    expect(terminal.map((event) => event.data)).toEqual(
      expect.arrayContaining([
        { turnId: "tablecast-lost-started", status: "interrupted" },
        { turnId: "tablecast-lost-interrupted", status: "interrupted" },
      ]),
    );
    const rows = await services.db.select().from(business.voiceTurns);
    expect(rows.find((row) => row.id === "tablecast-lost-started")).toMatchObject({
      status: "interrupted",
    });
    expect(typeof rows.find((row) => row.id === "tablecast-lost-started")?.ended_at).toBe("number");
    expect(rows.find((row) => row.id === "tablecast-lost-interrupted")).toMatchObject({
      status: "interrupted",
      ended_at: 2,
    });
    expect(rows.find((row) => row.id === "tablecast-lost-completed")).toMatchObject({
      status: "completed",
      ended_at: 2,
    });
    // 元の応答処理が遅れて終了しても、同じ終端イベントは増やさない。
    await finishVoiceTurn(services, voiceSessionId, "tablecast-lost-started", "interrupted");
    await setVoiceSession(services, device, after.voiceSessionId);
    expect(
      (await getTableState(services, device)).events.filter((event) => event.kind === "voice.turn"),
    ).toHaveLength(2);
  },
);

it("同じ音声session・他卓・切替後の新turnを古い停止要求で中断しない", async () => {
  await setupFixture();
  const services = createApiServices(env);
  const voiceSessionId = "tablecast-current-live";
  const nextSessionId = "tablecast-next-live";
  await setVoiceSession(services, device, voiceSessionId);
  await services.db.batch([
    services.db.insert(business.restaurantTables).values({
      id: "tablecast-other-table",
      store_id: device.storeId,
      name: "02",
    }),
    services.db.insert(business.tableSessions).values({
      id: "tablecast-other-session",
      store_id: device.storeId,
      table_id: "tablecast-other-table",
      locale: "ja",
      guest_count: 1,
      opened_at: 1,
      voice_session_id: "tablecast-other-live",
      voice_state: "active",
    }),
  ]);
  await services.db.insert(business.voiceTurns).values([
    {
      id: "tablecast-current-turn",
      voice_session_id: voiceSessionId,
      table_session_id: device.tableSessionId,
      store_id: device.storeId,
      status: "started",
      started_at: 1,
    },
    {
      id: "tablecast-other-table-turn",
      voice_session_id: "tablecast-other-live",
      table_session_id: "tablecast-other-session",
      store_id: device.storeId,
      status: "started",
      started_at: 1,
    },
  ]);
  await setVoiceSession(services, device, voiceSessionId);
  expect(
    (await getTableState(services, device)).events.some((event) => event.kind === "voice.turn"),
  ).toBe(false);
  expect(
    (await services.db.select().from(business.voiceTurns)).every((row) => row.status === "started"),
  ).toBe(true);
  await setVoiceSession(services, device, nextSessionId);
  await services.db.insert(business.voiceTurns).values({
    id: "tablecast-next-turn",
    voice_session_id: nextSessionId,
    table_session_id: device.tableSessionId,
    store_id: device.storeId,
    status: "started",
    started_at: 2,
  });
  await expect(setVoiceSession(services, device, null, voiceSessionId)).rejects.toMatchObject({
    code: "SESSION_STALE",
  });
  const state = await getTableState(services, device);
  expect(state.voiceSessionId).toBe(nextSessionId);
  expect(
    state.events.filter((event) => event.kind === "voice.turn").map((event) => event.data),
  ).toEqual([{ turnId: "tablecast-current-turn", status: "interrupted" }]);
  expect(
    await services.db
      .select({ status: business.voiceTurns.status })
      .from(business.voiceTurns)
      .where(eq(business.voiceTurns.id, "tablecast-next-turn"))
      .get(),
  ).toEqual({ status: "started" });
  expect(
    await services.db
      .select({ status: business.voiceTurns.status })
      .from(business.voiceTurns)
      .where(eq(business.voiceTurns.id, "tablecast-other-table-turn"))
      .get(),
  ).toEqual({ status: "started" });
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
