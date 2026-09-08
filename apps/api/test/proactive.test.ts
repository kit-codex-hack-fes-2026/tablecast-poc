import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import { getEvents, setVoiceSession, updateCart } from "../src/modules/operations";
import { finishVoiceTurn } from "../src/voice";
import { device, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const voiceId = "tablecast-proactive-voice";
const authHeaders = {
  authorization: "Bearer tablecast-test-voice-token",
  "content-type": "application/json",
};
const modelEnv = () => ({
  ...env,
  TABLECAST_MODEL_API_KEY: "tablecast-model-fixture",
  TABLECAST_MODEL: "gpt-4.1-mini",
});
const input = (turnId: string) => ({
  voiceSessionId: voiceId,
  turnId,
  locale: "ja",
  trigger: "proactive",
  messages: [],
});
async function setupProactive() {
  await setupFixture();
  await setVoiceSession(env, device, voiceId);
  await env.TABLECAST_DB.prepare(
    "UPDATE stores SET config_json=json_set(config_json,'$.cast.proactive',json('true')) WHERE id=?",
  )
    .bind(device.storeId)
    .run();
}
async function post(path: string, body: unknown, bindings = modelEnv()) {
  const context = createExecutionContext();
  const response = await app.request(
    path,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify(body),
    },
    bindings,
    context,
  );
  return { response, context };
}
function chunk(content: string, done = false) {
  return `data: ${JSON.stringify({ id: "tablecast-proactive-completion", object: "chat.completion.chunk", created: 1, model: "gpt-4.1-mini", choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: done ? "stop" : null }] })}\n\n${done ? "data: [DONE]\n\n" : ""}`;
}
const providerRequestSchema = z.object({
  messages: z.array(z.object({ role: z.string() })),
  tools: z.array(z.object({ function: z.object({ name: z.string() }) })),
});

it.each(["設定無効", "カート編集中", "スタッフ対応中", "確認待ち", "読了確認待ち", "応答生成中"])(
  "%sの自発接客はモデル資格が未設定でも204とし、業務状態を変更しない",
  async (reason) => {
    await setupProactive();
    if (reason === "設定無効")
      await env.TABLECAST_DB.prepare(
        "UPDATE stores SET config_json=json_set(config_json,'$.cast.proactive',json('false')) WHERE id=?",
      )
        .bind(device.storeId)
        .run();
    if (reason === "カート編集中")
      await updateCart(env, device, {
        expectedVersion: 0,
        lines: [{ id: "tea-line", productId: "tea", quantity: 1, selections: [] }],
      });
    if (reason === "スタッフ対応中")
      await env.TABLECAST_DB.prepare("UPDATE table_sessions SET staff_called=1 WHERE id=?")
        .bind(device.tableSessionId)
        .run();
    if (reason === "確認待ち" || reason === "読了確認待ち")
      await env.TABLECAST_DB.prepare(
        "INSERT INTO confirmations(id,store_id,table_session_id,cart_version,config_version,channel,status,snapshot_json,expires_at,created_at) VALUES('tablecast-proactive-confirmation',?,?,0,1,'voice',?,'{}',?,?)",
      )
        .bind(
          device.storeId,
          device.tableSessionId,
          reason === "確認待ち" ? "pending" : "read",
          Date.now() + 60_000,
          Date.now(),
        )
        .run();
    if (reason === "応答生成中")
      await env.TABLECAST_DB.batch([
        env.TABLECAST_DB.prepare(
          "INSERT INTO voice_turns(id,voice_session_id,table_session_id,store_id,locale,status,started_at) VALUES('tablecast-active-turn',?,?,?,'ja','started',?)",
        ).bind(voiceId, device.tableSessionId, device.storeId, Date.now()),
        env.TABLECAST_DB.prepare(
          "UPDATE table_sessions SET active_turn_id='tablecast-active-turn' WHERE id=?",
        ).bind(device.tableSessionId),
      ]);
    const before = await env.TABLECAST_DB.prepare("SELECT * FROM table_sessions WHERE id=?")
      .bind(device.tableSessionId)
      .first();
    const provider = vi.spyOn(globalThis, "fetch");
    const { response, context } = await post("/internal/voice/turns", input("tablecast-skipped"), {
      ...env,
      TABLECAST_MODEL: "",
      TABLECAST_MODEL_API_KEY: "",
    });
    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    await waitOnExecutionContext(context);
    expect(provider).not.toHaveBeenCalled();
    expect(
      await env.TABLECAST_DB.prepare("SELECT * FROM table_sessions WHERE id=?")
        .bind(device.tableSessionId)
        .first(),
    ).toEqual(before);
    expect(
      await env.TABLECAST_DB.prepare(
        "SELECT id FROM voice_turns WHERE id='tablecast-skipped'",
      ).first("id"),
    ).toBeNull();
    expect(
      (await getEvents(env, device)).events.filter(
        (event) => event.kind.startsWith("voice.") && event.kind !== "voice.started",
      ),
    ).toEqual([]);
  },
);

it("無言の同時要求を一度だけ予約し、読み取りtoolだけで生成して180秒の間隔を守る", async () => {
  await setupProactive();
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    if (typeof init?.body !== "string") throw new Error("モデル要求がJSONではありません");
    const request = providerRequestSchema.parse(JSON.parse(init.body));
    expect(request.tools.map((tool) => tool.function.name).sort()).toEqual([
      "getCatalog",
      "getTableState",
    ]);
    expect(request.messages.some((message) => message.role === "user")).toBe(false);
    return new Response(chunk("季節のお茶もご用意しています。", true), {
      headers: { "content-type": "text/event-stream" },
    });
  });
  const attempts = await Promise.all([
    post("/internal/voice/turns", input("tablecast-proactive-a")),
    post("/internal/voice/turns", input("tablecast-proactive-b")),
  ]);
  expect(attempts.map(({ response }) => response.status).sort((a, b) => a - b)).toEqual([200, 204]);
  for (const { response, context } of attempts) {
    expect(await response.text()).toBe(
      response.status === 200 ? "季節のお茶もご用意しています。" : "",
    );
    await waitOnExecutionContext(context);
  }
  const events = (await getEvents(env, device)).events;
  const accepted = events.filter((event) => event.kind === "voice.proactive");
  expect(accepted).toHaveLength(1);
  expect(events.some((event) => event.kind === "voice.user")).toBe(false);
  const metadata = z
    .object({ turnId: z.string(), trigger: z.literal("proactive"), locale: z.literal("ja") })
    .strict()
    .parse(accepted[0]?.data);
  await finishVoiceTurn(env, voiceId, metadata.turnId, "completed");
  const playback = await post("/internal/voice/playback", {
    voiceSessionId: voiceId,
    turnId: metadata.turnId,
    text: "季節のお茶もご用意しています。",
    interrupted: false,
  });
  expect(playback.response.status).toBe(200);
  const repeated = await post("/internal/voice/turns", input("tablecast-proactive-too-soon"));
  expect(repeated.response.status).toBe(204);
  expect(provider).toHaveBeenCalledTimes(1);
  await env.TABLECAST_DB.prepare(
    "UPDATE table_events SET created_at=? WHERE kind='voice.proactive'",
  )
    .bind(Date.now() - 180_001)
    .run();
  const later = await post("/internal/voice/turns", input("tablecast-proactive-later"));
  expect(later.response.status).toBe(200);
  await later.response.text();
  await waitOnExecutionContext(later.context);
  expect(provider).toHaveBeenCalledTimes(2);
  expect(await env.TABLECAST_DB.prepare("SELECT COUNT(*) FROM orders").first("COUNT(*)")).toBe(0);
  expect(
    await env.TABLECAST_DB.prepare("SELECT COUNT(*) FROM confirmations").first("COUNT(*)"),
  ).toBe(0);
  expect(
    await env.TABLECAST_DB.prepare("SELECT cart_json FROM table_sessions WHERE id=?")
      .bind(device.tableSessionId)
      .first("cart_json"),
  ).toBe("[]");
});

it.each(["客の発話", "設定の無効化"])(
  "%sが先に成立したら古い自発接客のstream・再生通知を拒否する",
  async (interruption) => {
    await setupProactive();
    const pending = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
    const provider = vi.spyOn(globalThis, "fetch");
    provider.mockImplementationOnce(
      async (_url, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(chunk("お茶の紹介です。")));
              pending.resolve(controller);
              init?.signal?.addEventListener("abort", () => controller.close(), { once: true });
            },
          }),
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    provider.mockImplementation(
      async () =>
        new Response(chunk("はい。", true), { headers: { "content-type": "text/event-stream" } }),
    );
    const { response, context } = await post(
      "/internal/voice/turns",
      input("tablecast-old-proactive"),
    );
    expect(response.status).toBe(200);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("自発接客のstreamがありません");
    expect((await reader.read()).done).toBe(false);
    const stopped = reader.read().then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    let userResult: { status: number; text: string } | null = null;
    if (interruption === "客の発話") {
      const user = await post("/internal/voice/turns", {
        ...input("tablecast-new-user"),
        trigger: "user",
        speaker: { id: "0", streamId: "tablecast-test-stream", words: [] },
        messages: [{ role: "user", content: "すみません" }],
      });
      userResult = { status: user.response.status, text: await user.response.text() };
      await waitOnExecutionContext(user.context);
    } else {
      await env.TABLECAST_DB.prepare(
        "UPDATE stores SET config_json=json_set(config_json,'$.cast.proactive',json('false')) WHERE id=?",
      )
        .bind(device.storeId)
        .run();
    }
    expect(userResult).toEqual(
      interruption === "客の発話" ? { status: 200, text: "はい。" } : null,
    );
    (await pending.promise).enqueue(new TextEncoder().encode(chunk("この続きは届きません。")));
    expect(await stopped).toMatchObject({
      error: { code: interruption === "客の発話" ? "VOICE_SESSION_STALE" : "PROACTIVE_TURN_STALE" },
    });
    await waitOnExecutionContext(context);
    const playback = await post("/internal/voice/playback", {
      voiceSessionId: voiceId,
      turnId: "tablecast-old-proactive",
      text: "この続きは届きません。",
      interrupted: false,
    });
    expect(playback.response.status).toBe(409);
    expect(
      (await getEvents(env, device)).events.some(
        (event) =>
          event.kind === "voice.assistant" && event.data["turnId"] === "tablecast-old-proactive",
      ),
    ).toBe(false);
    await vi.waitFor(async () => {
      expect(
        await env.TABLECAST_DB.prepare("SELECT active_turn_id FROM table_sessions WHERE id=?")
          .bind(device.tableSessionId)
          .first("active_turn_id"),
      ).toBe(interruption === "客の発話" ? "tablecast-new-user" : null);
      expect(
        await env.TABLECAST_DB.prepare(
          "SELECT status FROM voice_turns WHERE id='tablecast-old-proactive'",
        ).first("status"),
      ).toBe("interrupted");
    });
  },
);

it("自発接客でも古い音声sessionと言語をモデルへ渡さない", async () => {
  await setupProactive();
  const provider = vi.spyOn(globalThis, "fetch");
  for (const changed of [{ voiceSessionId: "tablecast-old-voice" }, { locale: "en" }]) {
    const { response } = await post("/internal/voice/turns", {
      ...input("tablecast-stale"),
      ...changed,
    });
    expect(response.status).toBe(409);
  }
  expect(provider).not.toHaveBeenCalled();
  expect(await env.TABLECAST_DB.prepare("SELECT COUNT(*) FROM voice_turns").first("COUNT(*)")).toBe(
    0,
  );
});

it("音声設定へ公開済みの自発接客フラグを返し、通常turnの客発話要件を維持する", async () => {
  await setupProactive();
  await env.TABLECAST_DB.prepare(
    "UPDATE stores SET config_json=json_set(config_json,'$.cast.voice.ja','tablecast-fixture-voice') WHERE id=?",
  )
    .bind(device.storeId)
    .run();
  const config = await app.request(
    `/internal/voice/config?voiceSessionId=${voiceId}`,
    { headers: authHeaders },
    env,
  );
  expect(config.status).toBe(200);
  expect(z.object({ proactive: z.boolean() }).parse(await config.json()).proactive).toBe(true);
  const provider = vi.spyOn(globalThis, "fetch");
  for (const messages of [[], [{ role: "assistant", content: "ごゆっくりどうぞ。" }]]) {
    const { response } = await post("/internal/voice/turns", {
      ...input("tablecast-not-a-user"),
      trigger: "user",
      messages,
    });
    expect(response.status).toBe(422);
  }
  expect(provider).not.toHaveBeenCalled();
  expect(await env.TABLECAST_DB.prepare("SELECT COUNT(*) FROM voice_turns").first("COUNT(*)")).toBe(
    0,
  );
});
