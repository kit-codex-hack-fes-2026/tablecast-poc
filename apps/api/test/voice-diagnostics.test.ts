import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { Agent } from "@mastra/core/agent";
import { RequestContext } from "@mastra/core/request-context";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import app from "../src/app";
import { DomainError } from "../src/errors";
import { setVoiceSession } from "../src/modules/operations";
import { device, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const voiceId = "tablecast-diagnostics-voice";
const turnId = "tablecast-diagnostics-turn";
const privateText = "tablecast-private-conversation-marker";
const privateReply = "tablecast-private-model-reply-marker";
const privateSpeaker = "tablecast-private-speaker-marker";
const privateError = "tablecast-private-provider-error-marker";
const privateModelKey = "tablecast-private-model-key-marker";
const incomingTrace = "tablecast-untrusted-request-id";
const bindings = () => ({
  ...env,
  TABLECAST_MODEL: "gpt-4.1-mini",
  TABLECAST_MODEL_API_KEY: privateModelKey,
  TABLECAST_RELEASE_SHA: "tablecast-diagnostics-release",
});
const input = () => ({
  voiceSessionId: voiceId,
  turnId,
  locale: "ja",
  messages: [{ role: "user", content: privateText }],
  speaker: { id: privateSpeaker, streamId: privateSpeaker, words: [] },
});
const logSchema = z
  .object({
    event: z.literal("tablecast.voice_turn"),
    operation: z.literal("turn"),
    phase: z.enum(["accepted", "generated", "rejected", "interrupted", "failed", "skipped"]),
    traceId: z.uuid(),
    releaseSha: z.literal("tablecast-diagnostics-release"),
    storeId: z.string().optional(),
    tableSessionId: z.string().optional(),
    voiceSessionId: z.string().optional(),
    turnId: z.string().optional(),
    runId: z.string().optional(),
    code: z.string().optional(),
  })
  .strict();
function capture() {
  const info = vi.spyOn(console, "info").mockImplementation(() => {});
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  return {
    values: () =>
      info.mock.calls.map(([line]) => logSchema.parse(JSON.parse(z.string().parse(line)))),
    verifyPrivate: () => {
      const output = JSON.stringify([info.mock.calls, warn.mock.calls, error.mock.calls]);
      for (const secret of [
        privateText,
        privateReply,
        privateSpeaker,
        privateError,
        privateModelKey,
        incomingTrace,
        "tablecast-test-voice-token",
        "tablecast-private-cookie-marker",
      ])
        expect(output).not.toContain(secret);
      expect(warn).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    },
  };
}
function chunk(text: string, done = false) {
  return `data: ${JSON.stringify({
    id: "tablecast-diagnostics-completion",
    object: "chat.completion.chunk",
    created: 1,
    model: "gpt-4.1-mini",
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content: text },
        finish_reason: done ? "stop" : null,
      },
    ],
  })}\n\n${done ? "data: [DONE]\n\n" : ""}`;
}
async function post(
  body: unknown = input(),
  token = "Bearer tablecast-test-voice-token",
  configured = bindings(),
  signal?: AbortSignal,
) {
  const context = createExecutionContext();
  const response = await app.request(
    "/internal/voice/turns",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: token,
        cookie: "tablecast-private-cookie-marker",
        "x-request-id": incomingTrace,
      },
      body: JSON.stringify(body),
      signal,
    },
    configured,
    context,
  );
  return { response, context };
}
async function setup() {
  await setupFixture();
  await setVoiceSession(env, device, voiceId);
}

it("API発行traceIdを認可済み卓・turn・Mastra RequestContextと公開runIdへ対応づける", async () => {
  await setup();
  const logs = capture();
  const agentStream = vi.spyOn(Agent.prototype, "stream");
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(chunk(privateReply, true), {
      headers: { "content-type": "text/event-stream" },
    }),
  );

  const { response, context } = await post();
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(privateReply);
  await waitOnExecutionContext(context);

  const traceId = response.headers.get("x-request-id");
  const values = logs.values();
  expect(values.map((log) => log.phase)).toEqual(["accepted", "generated"]);
  for (const value of values)
    expect(value).toMatchObject({
      traceId,
      storeId: device.storeId,
      tableSessionId: device.tableSessionId,
      voiceSessionId: voiceId,
      turnId,
    });
  const callArguments: readonly unknown[] = agentStream.mock.calls[0] ?? [];
  const { requestContext } = z
    .object({ requestContext: z.instanceof(RequestContext) })
    .parse(callArguments[1]);
  expect(requestContext.get("diagnostics")).toMatchObject({
    traceId,
    tableSessionId: device.tableSessionId,
    voiceSessionId: voiceId,
    turnId,
    releaseSha: bindings().TABLECAST_RELEASE_SHA,
  });
  const output: unknown = await agentStream.mock.results[0]?.value;
  expect(values[1]?.runId).toBe(z.object({ runId: z.string() }).parse(output).runId);
  expect(values[1]?.runId).toBeTruthy();
  expect(
    await env.TABLECAST_DB.prepare("SELECT status FROM voice_turns WHERE id=?")
      .bind(turnId)
      .first("status"),
  ).toBe("started");
  logs.verifyPrivate();
});

it("認可後の409拒否は対応IDを残し、Mastraを呼ばない", async () => {
  await setup();
  const logs = capture();
  const provider = vi.spyOn(globalThis, "fetch");

  const { response, context } = await post({ ...input(), locale: "en" });
  await waitOnExecutionContext(context);

  expect(response.status).toBe(409);
  expect(logs.values()).toEqual([
    {
      event: "tablecast.voice_turn",
      operation: "turn",
      phase: "rejected",
      traceId: response.headers.get("x-request-id"),
      releaseSha: bindings().TABLECAST_RELEASE_SHA,
      storeId: device.storeId,
      tableSessionId: device.tableSessionId,
      voiceSessionId: voiceId,
      turnId,
      code: "VOICE_LOCALE_STALE",
    },
  ]);
  expect(provider).not.toHaveBeenCalled();
  logs.verifyPrivate();
});

it("未認可・不正入力・不在sessionでは入力中の診断IDを信用しない", async () => {
  await setup();
  const logs = capture();
  const provider = vi.spyOn(globalThis, "fetch");
  const attempts = [
    {
      body: input(),
      token: "Bearer tablecast-private-invalid-token",
      status: 401,
      code: "VOICE_UNAUTHORIZED",
    },
    {
      body: { ...input(), turnId: privateText.repeat(10) },
      token: "Bearer tablecast-test-voice-token",
      status: 422,
      code: "INVALID_INPUT",
    },
    {
      body: { ...input(), voiceSessionId: "tablecast-unrecognised-voice" },
      token: "Bearer tablecast-test-voice-token",
      status: 409,
      code: "VOICE_SESSION_STALE",
    },
  ];

  for (const attempt of attempts) {
    const { response, context } = await post(attempt.body, attempt.token);
    await waitOnExecutionContext(context);
    expect(response.status).toBe(attempt.status);
    expect(logs.values().at(-1)).toEqual({
      event: "tablecast.voice_turn",
      operation: "turn",
      phase: "rejected",
      traceId: response.headers.get("x-request-id"),
      releaseSha: bindings().TABLECAST_RELEASE_SHA,
      code: attempt.code,
    });
  }
  expect(provider).not.toHaveBeenCalled();
  logs.verifyPrivate();
});

it("204の自発接客をスキップとして記録し、生成受付やDB turnを作らない", async () => {
  await setup();
  const logs = capture();
  const provider = vi.spyOn(globalThis, "fetch");
  const { response, context } = await post(
    { voiceSessionId: voiceId, turnId, locale: "ja", trigger: "proactive", messages: [] },
    undefined,
    {
      ...bindings(),
      TABLECAST_MODEL: "",
      TABLECAST_MODEL_API_KEY: "",
    },
  );
  await waitOnExecutionContext(context);

  expect(response.status).toBe(204);
  expect(logs.values().map((log) => log.phase)).toEqual(["skipped"]);
  expect(logs.values()[0]).toMatchObject({
    traceId: response.headers.get("x-request-id"),
    tableSessionId: device.tableSessionId,
    voiceSessionId: voiceId,
    turnId,
  });
  expect(provider).not.toHaveBeenCalled();
  expect(
    await env.TABLECAST_DB.prepare("SELECT id FROM voice_turns WHERE id=?")
      .bind(turnId)
      .first("id"),
  ).toBeNull();
  logs.verifyPrivate();
});

it.each(["途中失敗", "利用側の取消", "HTTP要求の取消"])(
  "stream開始後の%sも同じtraceId・turnId・runIdで追跡する",
  async (scenario) => {
    await setup();
    const logs = capture();
    const control = Promise.withResolvers<ReadableStreamDefaultController<Uint8Array>>();
    const aborted = Promise.withResolvers<void>();
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            control.resolve(controller);
            controller.enqueue(new TextEncoder().encode(chunk(privateReply)));
            init?.signal?.addEventListener(
              "abort",
              () => {
                if (scenario !== "途中失敗") controller.close();
                aborted.resolve();
              },
              { once: true },
            );
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    });
    const cancellation = new AbortController();
    const { response, context } = await post(undefined, undefined, undefined, cancellation.signal);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("音声streamがありません");
    expect(response.status).toBe(200);
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(privateReply);

    let completion: Promise<unknown>;
    if (scenario === "途中失敗") {
      (await control.promise).error(new Error(privateError));
      completion = reader.read();
    } else if (scenario === "利用側の取消") {
      completion = reader.cancel(privateError);
    } else {
      cancellation.abort(privateError);
      completion = reader.read();
    }
    const outcome = await completion.then(
      () => ({ status: "resolved", code: undefined }),
      (error: unknown) => ({
        status: "rejected",
        code: error instanceof DomainError ? error.code : undefined,
      }),
    );
    expect(outcome).toEqual({
      status: scenario === "利用側の取消" ? "resolved" : "rejected",
      code: scenario === "途中失敗" ? "VOICE_MODEL_FAILED" : undefined,
    });
    if (scenario !== "途中失敗") await aborted.promise;
    await waitOnExecutionContext(context);
    const phase = scenario === "途中失敗" ? "failed" : "interrupted";
    await vi.waitFor(async () =>
      expect(
        await env.TABLECAST_DB.prepare("SELECT status FROM voice_turns WHERE id=?")
          .bind(turnId)
          .first("status"),
      ).toBe(phase),
    );

    const values = logs.values();
    expect(values.map((log) => log.phase)).toEqual(["accepted", phase]);
    expect(values[1]?.code).toBe(
      scenario === "途中失敗" ? "VOICE_MODEL_FAILED" : "VOICE_CANCELLED",
    );
    for (const value of values)
      expect(value).toMatchObject({
        traceId: response.headers.get("x-request-id"),
        tableSessionId: device.tableSessionId,
        voiceSessionId: voiceId,
        turnId,
      });
    expect(values[1]?.runId).toBeTruthy();
    logs.verifyPrivate();
  },
);
