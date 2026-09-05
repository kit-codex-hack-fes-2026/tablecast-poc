import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TokenVerifier } from "livekit-server-sdk";
import app from "../src/app";
import {
  getEvents,
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
  TABLECAST_MODEL: "gpt-4.1-mini",
});
function completion(delta: unknown, finishReason: string) {
  return `data: ${JSON.stringify({ id: "tablecast-completion", object: "chat.completion.chunk", created: 1, model: "gpt-4.1-mini", choices: [{ index: 0, delta, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: "tablecast-completion", object: "chat.completion.chunk", created: 1, model: "gpt-4.1-mini", choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\ndata: [DONE]\n\n`;
}
function modelResponse(body: string) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
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
  it("実D1とMastraのstreamを通し日本語textだけを返す", async () => {
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
  });
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
      await env.TABLECAST_DB.prepare(
        "INSERT INTO voice_turns(id,voice_session_id,table_session_id,store_id,locale,status,started_at) VALUES(?,?,?,?,'ja','completed',?)",
      )
        .bind(turnId, voiceId, device.tableSessionId, device.storeId, Date.now())
        .run();
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
