import { insertFixture } from "./database-fixture";
import * as businessTables from "../src/db/business-schema";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import app from "../src/app";
import {
  getEvents,
  getTableState,
  getVoiceConfirmation,
  setVoiceSession,
  updateCart,
} from "../src/modules/operations";
import { finishVoiceTurn, issueVoiceToken, stopVoiceRoom } from "../src/voice";
import { device, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const voiceId = "tablecast-voice-fixture";
const authHeaders = {
  authorization: "Bearer tablecast-test-voice-token",
  "content-type": "application/json",
};
const modelEnv = () => ({
  ...env,
  TABLECAST_MODEL_API_KEY: "tablecast-model-fixture",
  TABLECAST_MODEL: "gpt-5.6-luna",
});
function completion(delta: unknown, finishReason: string) {
  return `data: ${JSON.stringify({ id: "tablecast-completion", object: "chat.completion.chunk", created: 1, model: "gpt-5.6-luna", choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "tablecast-completion", object: "chat.completion.chunk", created: 1, model: "gpt-5.6-luna", choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`;
}
function modelResponse(body: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    if (typeof init?.body !== "string") throw new Error("モデルへの本文がJSON文字列ではありません");
    const request: unknown = JSON.parse(init.body);
    expect(request).toMatchObject({
      model: "gpt-5.6-luna",
      reasoning_effort: "none",
    });
    expect(request).toHaveProperty("tools.0.type", "function");
    return new Response(body, { headers: { "content-type": "text/event-stream" } });
  });
}

describe("音声HTTPとMastraの接続契約", () => {
  it.each([200, 404])("Room停止は対象のRoomだけを削除しHTTP %iを完了扱いにする", async (status) => {
    const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      expect(input instanceof Request ? input.url : input.toString()).toBe(
        "http://tablecast-livekit.local/twirp/livekit.RoomService/DeleteRoom",
      );
      if (typeof init?.body !== "string")
        throw new Error("Room削除の本文がJSON文字列ではありません");
      expect(JSON.parse(init.body)).toEqual({ room: `tablecast-${voiceId}` });
      return Response.json(status === 404 ? { code: "not_found", msg: "room missing" } : {}, {
        status,
      });
    });
    await stopVoiceRoom(
      {
        ...env,
        TABLECAST_LIVEKIT_URL: "ws://tablecast-livekit.local",
        TABLECAST_LIVEKIT_API_KEY: "tablecast-key",
        TABLECAST_LIVEKIT_API_SECRET: "tablecast-secret",
      },
      voiceId,
    );
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("Room停止の外部障害を完了扱いにせず503で返す", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ code: "unavailable", msg: "unavailable" }, { status: 503 }),
    );
    await expect(
      stopVoiceRoom(
        {
          ...env,
          TABLECAST_LIVEKIT_URL: "ws://tablecast-livekit.local",
          TABLECAST_LIVEKIT_API_KEY: "tablecast-key",
          TABLECAST_LIVEKIT_API_SECRET: "tablecast-secret",
        },
        voiceId,
      ),
    ).rejects.toMatchObject({ code: "VOICE_ROOM_STOP_FAILED", status: 503 });
  });
  it("モデルのerror chunkを空の正常応答へ変えずturnを失敗にする", async () => {
    await setupFixture();
    await setVoiceSession(env, device, voiceId);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json(
        {
          error: {
            message: "fixture denied",
            type: "invalid_request_error",
            code: "invalid_api_key",
          },
        },
        { status: 401 },
      ),
    );
    const context = createExecutionContext();
    const response = await app.request(
      "/internal/voice/turns",
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          voiceSessionId: voiceId,
          turnId: "tablecast-turn-failed",
          locale: "ja",
          speaker: { id: "0", streamId: "tablecast-test-stream", words: [] },
          messages: [{ role: "user", content: "メニューを教えて" }],
        }),
      },
      modelEnv(),
      context,
    );
    await expect(response.text()).rejects.toMatchObject({ code: "VOICE_MODEL_FAILED" });
    await waitOnExecutionContext(context);
    await vi.waitFor(async () =>
      expect(
        await env.TABLECAST_DB.prepare("SELECT status FROM voice_turns WHERE id=?")
          .bind("tablecast-turn-failed")
          .first("status"),
      ).toBe("failed"),
    );
    expect(
      (await getEvents(env, device)).events
        .filter((event) => event.kind === "voice.failed")
        .map((event) => event.data),
    ).toEqual([{ turnId: "tablecast-turn-failed", code: "VOICE_MODEL_FAILED" }]);
  });
  it("内部パスでもサービスtokenなしと長さが異なるtokenを拒否する", async () => {
    for (const token of ["", "x"]) {
      const response = await app.request(
        "/internal/voice/config?voiceSessionId=test",
        { headers: { authorization: token } },
        env,
      );
      expect(response.status).toBe(401);
    }
  });
  it("参加tokenを一つの音声Roomとマイクだけへ限定する", async () => {
    const configured = {
      ...modelEnv(),
      TABLECAST_LIVEKIT_URL: "ws://127.0.0.1:7880",
      TABLECAST_LIVEKIT_API_KEY: "tablecast-local-key",
      TABLECAST_LIVEKIT_API_SECRET: "tablecast-local-test-secret-only",
    };
    const result = await issueVoiceToken(configured, voiceId);
    const claims = await new TokenVerifier(
      configured.TABLECAST_LIVEKIT_API_KEY,
      configured.TABLECAST_LIVEKIT_API_SECRET,
    ).verify(result.token);
    expect(claims.sub).toBe(`tablecast-device-${voiceId}`);
    expect(claims.video).toMatchObject({
      room: `tablecast-${voiceId}`,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    });
    expect(claims.video?.canPublishSources).toEqual(["microphone"]);
    expect(claims.roomConfig?.agents[0]?.agentName).toBe("tablecast-voice");
  });
  it("未選定のvoiceは接続済みと扱わず設定エラーにする", async () => {
    await setupFixture();
    await setVoiceSession(env, device, voiceId);
    const response = await app.request(
      `/internal/voice/config?voiceSessionId=${voiceId}`,
      { headers: authHeaders },
      env,
    );
    expect(response.status).toBe(503);
  });
  it("音声のLunaへ推論なしと業務toolsを送信し実D1とMastraから日本語textだけを返す", async () => {
    await setupFixture();
    await setVoiceSession(env, device, voiceId);
    const provider = modelResponse(
      completion({ role: "assistant", content: "はい、ほうじ茶ですね。" }, "stop"),
    );
    const context = createExecutionContext();
    const response = await app.request(
      "/internal/voice/turns",
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          voiceSessionId: voiceId,
          turnId: "tablecast-turn-text",
          locale: "ja",
          speaker: { id: "0", streamId: "tablecast-test-stream", words: [] },
          messages: [{ role: "user", content: "ほうじ茶を教えて" }],
        }),
      },
      modelEnv(),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("はい、ほうじ茶ですね。");
    await waitOnExecutionContext(context);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(
      (await getEvents(env, device)).events.filter((event) => event.kind === "voice.assistant"),
    ).toHaveLength(0);
  });
  it("確認準備toolの後は追加生成せず同じDBに固定読み上げを残す", async () => {
    await setupFixture();
    await updateCart(env, device, {
      expectedVersion: 0,
      lines: [{ id: "tea-line", productId: "tea", quantity: 2, selections: [] }],
    });
    await setVoiceSession(env, device, voiceId);
    const provider = modelResponse(
      completion(
        {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: "tablecast-tool-1",
              type: "function",
              function: { name: "prepareConfirmation", arguments: '{"expectedVersion":1}' },
            },
          ],
        },
        "tool_calls",
      ),
    );
    const context = createExecutionContext();
    const response = await app.request(
      "/internal/voice/turns",
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          voiceSessionId: voiceId,
          turnId: "tablecast-turn-confirm",
          locale: "ja",
          speaker: { id: "0", streamId: "tablecast-test-stream", words: [] },
          messages: [{ role: "user", content: "注文内容を確認して" }],
        }),
      },
      modelEnv(),
      context,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    await waitOnExecutionContext(context);
    const snapshot = await getVoiceConfirmation(env, {
      ...device,
      kind: "voice",
      voiceSessionId: voiceId,
      turnId: "tablecast-turn-confirm",
    });
    expect(snapshot?.total).toBe(800);
    expect(snapshot?.text).toContain("ほうじ茶");
    expect(snapshot?.status).toBe("pending");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(
      (await getEvents(env, device)).events
        .filter((event) => event.kind === "voice.tool")
        .map((event) => event.data),
    ).toEqual([
      {
        turnId: "tablecast-turn-confirm",
        toolCallId: "tablecast-tool-1",
        toolName: "prepareConfirmation",
        state: "running",
      },
      {
        turnId: "tablecast-turn-confirm",
        toolCallId: "tablecast-tool-1",
        toolName: "prepareConfirmation",
        state: "completed",
      },
    ]);
  });
  it.each([
    { productId: "tea", state: "completed" },
    { productId: "tablecast-private-invalid-product", state: "error" },
  ])(
    "実toolでタブと商品カードを反映し$stateだけを引数や結果本文なしで記録する",
    async ({ productId, state }) => {
      await setupFixture();
      await setVoiceSession(env, device, voiceId);
      const provider = modelResponse(
        completion({ role: "assistant", content: "画面をご覧ください。" }, "stop"),
      );
      provider.mockResolvedValueOnce(
        new Response(
          completion(
            {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "tablecast-ui-call",
                  type: "function",
                  function: {
                    name: "setUiSection",
                    arguments: JSON.stringify({ section: "menu", productId: "tea" }),
                  },
                },
                {
                  index: 1,
                  id: "tablecast-products-call",
                  type: "function",
                  function: {
                    name: "showProducts",
                    arguments: JSON.stringify({ productIds: [productId] }),
                  },
                },
              ],
            },
            "tool_calls",
          ),
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
      const context = createExecutionContext();
      const response = await app.request(
        "/internal/voice/turns",
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            voiceSessionId: voiceId,
            turnId: "tablecast-turn-presentation",
            locale: "ja",
            speaker: { id: "0", streamId: "tablecast-test-stream", words: [] },
            messages: [{ role: "user", content: "おすすめと注文履歴を見せて" }],
          }),
        },
        modelEnv(),
        context,
      );
      expect(await response.text()).toBe("画面をご覧ください。");
      await waitOnExecutionContext(context);
      expect(provider).toHaveBeenCalledTimes(2);
      expect(
        await env.TABLECAST_DB.prepare(
          "SELECT ui_section,selected_product_id FROM table_sessions WHERE id=?",
        )
          .bind(device.tableSessionId)
          .first(),
      ).toEqual({ ui_section: "menu", selected_product_id: "tea" });
      const events = (await getEvents(env, device)).events;
      const tools = events
        .filter((event) => event.kind === "voice.tool")
        .map((event) => event.data);
      expect(
        tools.filter((event) => event.toolName === "setUiSection").map((event) => event.state),
      ).toEqual(["running", "completed"]);
      expect(tools.filter((event) => event.toolName === "showProducts")).toEqual([
        {
          turnId: "tablecast-turn-presentation",
          toolCallId: "tablecast-products-call",
          toolName: "showProducts",
          state: "running",
        },
        {
          turnId: "tablecast-turn-presentation",
          toolCallId: "tablecast-products-call",
          toolName: "showProducts",
          state,
          ...(state === "error" ? { errorCode: "VOICE_TOOL_FAILED" } : {}),
        },
      ]);
      expect(JSON.stringify(tools)).not.toContain(productId);
      expect(
        events.filter((event) => event.kind === "voice.products").map((event) => event.data),
      ).toEqual(
        state === "completed"
          ? [{ turnId: "tablecast-turn-presentation", productIds: ["tea"] }]
          : [],
      );
      expect(events.filter((event) => event.kind === "voice.failed")).toHaveLength(0);
    },
  );
  it("consumer取消でモデルのAbortSignalとDBの古いturnを停止する", async () => {
    await setupFixture();
    await setVoiceSession(env, device, voiceId);
    const aborted = Promise.withResolvers<void>();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          const chunk = {
            id: "tablecast-pending",
            object: "chat.completion.chunk",
            created: 1,
            model: "gpt-4.1-mini",
            choices: [
              { index: 0, delta: { role: "assistant", content: "はい。" }, finish_reason: null },
            ],
          };
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          init?.signal?.addEventListener(
            "abort",
            () => {
              controller.close();
              aborted.resolve();
            },
            { once: true },
          );
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    });
    const context = createExecutionContext();
    const response = await app.request(
      "/internal/voice/turns",
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          voiceSessionId: voiceId,
          turnId: "tablecast-turn-cancel",
          locale: "ja",
          speaker: { id: "0", streamId: "tablecast-test-stream", words: [] },
          messages: [{ role: "user", content: "メニューを教えて" }],
        }),
      },
      modelEnv(),
      context,
    );
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    await reader?.read();
    await reader?.cancel();
    await aborted.promise;
    await waitOnExecutionContext(context);
    expect(
      await env.TABLECAST_DB.prepare("SELECT active_turn_id FROM table_sessions WHERE id=?")
        .bind(device.tableSessionId)
        .first("active_turn_id"),
    ).toBeNull();
    expect(
      await env.TABLECAST_DB.prepare("SELECT status FROM voice_turns WHERE id=?")
        .bind("tablecast-turn-cancel")
        .first("status"),
    ).toBe("interrupted");
  });
  it.each(["interrupted", "failed"] as const)(
    "生成後の%sを遅い再生通知で完了へ戻さず元の言語を残す",
    async (status) => {
      await setupFixture();
      await setVoiceSession(env, device, voiceId);
      const turnId = "tablecast-turn-playback";
      await insertFixture(businessTables.voiceTurns, {
        id: turnId,
        voice_session_id: voiceId,
        table_session_id: device.tableSessionId,
        store_id: device.storeId,
        locale: "ja",
        status: "completed",
        started_at: Date.now(),
      }).run();
      await finishVoiceTurn(env, voiceId, turnId, status);
      await env.TABLECAST_DB.prepare("UPDATE table_sessions SET locale='en' WHERE id=?")
        .bind(device.tableSessionId)
        .run();
      const response = await app.request(
        "/internal/voice/playback",
        {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify({
            voiceSessionId: voiceId,
            turnId,
            text: "はい。",
            interrupted: false,
          }),
        },
        env,
      );
      expect(response.status).toBe(200);
      await finishVoiceTurn(env, voiceId, turnId, "completed");
      expect(
        await env.TABLECAST_DB.prepare("SELECT status FROM voice_turns WHERE id=?")
          .bind(turnId)
          .first("status"),
      ).toBe(status);
      expect(
        (await getEvents(env, device)).events.find((event) => event.kind === "voice.assistant")
          ?.data,
      ).toMatchObject({ role: "assistant", locale: "ja", text: "はい。" });
    },
  );
});

it.each([
  { tool: "setSpeechSpeed", input: { speed: 1.4 } },
  { tool: "setLanguage", input: { locale: "en" } },
])("認識済み客の$toolをMastraからGUIと同じ状態へ反映する", async ({ tool, input }) => {
  await setupFixture();
  await setVoiceSession(env, device, voiceId);
  const provider = modelResponse(
    completion(
      {
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "tablecast-setting-call",
            type: "function",
            function: { name: tool, arguments: JSON.stringify(input) },
          },
        ],
      },
      "tool_calls",
    ),
  );
  const context = createExecutionContext();
  const response = await app.request(
    "/internal/voice/turns",
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        voiceSessionId: voiceId,
        turnId: "tablecast-setting-turn",
        locale: "ja",
        speaker: { id: "0", streamId: "tablecast-test-stream", words: [] },
        messages: [
          { role: "user", content: tool === "setLanguage" ? "英語に変えて" : "1.4倍にして" },
        ],
      }),
    },
    modelEnv(),
    context,
  );
  expect(response.status).toBe(200);
  const result = await response.text().then(
    () => "completed",
    () => "interrupted",
  );
  expect(result).toBe(tool === "setLanguage" ? "interrupted" : "completed");
  await waitOnExecutionContext(context);
  const state = await getTableState(env, device);
  expect(state).toMatchObject(
    tool === "setLanguage"
      ? { locale: "en", voiceState: "stopped" }
      : { speechSpeed: 1.4, voiceState: "active" },
  );
  expect(
    state.events.some(
      (event) =>
        event.kind === "voice.tool" &&
        event.data.toolName === tool &&
        event.data.state === "completed",
    ),
  ).toBe(true);
  expect(provider).toHaveBeenCalled();
});

it.each([
  undefined,
  { id: null, streamId: "tablecast-stream", words: [] },
  { id: "0", streamId: "", words: [] },
])("話者情報の欠損で会話を止めず通常の応答を返す: %j", async (speaker) => {
  await setupFixture();
  await setVoiceSession(env, device, voiceId);
  const before = await getTableState(env, device);
  const provider = modelResponse(
    completion({ role: "assistant", content: "ご注文を伺います。" }, "stop"),
  );
  const context = createExecutionContext();
  const response = await app.request(
    "/internal/voice/turns",
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        voiceSessionId: voiceId,
        turnId: "tablecast-unidentified",
        locale: "ja",
        speaker,
        messages: [{ role: "user", content: "注文して" }],
      }),
    },
    modelEnv(),
    context,
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toBe("ご注文を伺います。");
  await waitOnExecutionContext(context);
  expect(provider).toHaveBeenCalledTimes(1);
  const after = await getTableState(env, device);
  expect(after.voiceState).toBe("active");
  expect(after.cart).toEqual(before.cart);
  expect(after.orders).toEqual(before.orders);
  expect(after.events.some((event) => event.kind === "voice.failed")).toBe(false);
});

it("ツール前の声かけを結果待ちせず同じHTTP応答へstreamし完了後に続きも返す", async () => {
  await setupFixture();
  await setVoiceSession(env, device, voiceId);
  const releaseTool = Promise.withResolvers<void>();
  const acknowledgement = "[warm, composed and conversational]確認しますね。";
  let requested = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    expect(input instanceof Request ? input.url : input.toString()).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    requested += 1;
    if (requested > 1)
      return new Response(
        completion({ role: "assistant", content: "おしながきを確認しました。" }, "stop"),
        { headers: { "content-type": "text/event-stream" } },
      );
    let first = true;
    return new Response(
      new ReadableStream({
        async pull(controller) {
          if (first) {
            first = false;
            controller.enqueue(
              new TextEncoder().encode(
                completion({ role: "assistant", content: acknowledgement }, "stop").split(
                  "\n\n",
                )[0] + "\n\n",
              ),
            );
            return;
          }
          await releaseTool.promise;
          controller.enqueue(
            new TextEncoder().encode(
              completion(
                {
                  tool_calls: [
                    {
                      index: 0,
                      id: "tablecast-check-menu",
                      type: "function",
                      function: { name: "getCatalog", arguments: "{}" },
                    },
                  ],
                },
                "tool_calls",
              ),
            ),
          );
          controller.close();
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
  });
  const context = createExecutionContext();
  const response = await app.request(
    "/internal/voice/turns",
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({
        voiceSessionId: voiceId,
        turnId: "tablecast-early-ack",
        locale: "ja",
        messages: [{ role: "user", content: "おしながきを確認して" }],
      }),
    },
    modelEnv(),
    context,
  );
  const reader = response.body?.getReader();
  if (!reader) throw new Error("音声応答のstreamがありません");
  try {
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe(acknowledgement);
    expect(requested).toBe(1);
    expect(
      (await getTableState(env, device)).events.some((event) => event.kind === "voice.tool"),
    ).toBe(false);
    releaseTool.resolve();
    let rest = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      rest += new TextDecoder().decode(chunk.value);
    }
    expect(rest).toBe("おしながきを確認しました。");
    expect(
      (await getTableState(env, device)).events.some(
        (event) => event.kind === "voice.tool" && event.data.state === "completed",
      ),
    ).toBe(true);
  } finally {
    releaseTool.resolve();
    await reader.cancel();
    await waitOnExecutionContext(context);
  }
});
