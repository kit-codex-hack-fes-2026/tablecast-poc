import { instrument, OTLPExporter } from "@inference-net/otel-cf-workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { RequestContext } from "@mastra/core/request-context";
import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import { createCastAgent } from "../src/modules/voice/agent";
import { createApiServices, type ApiEnv } from "../src/platform/context";
import { telemetryConfig } from "../src/platform/telemetry";
import { device, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());

it.each([
  { capture: false, status: 200 },
  { capture: true, status: 200 },
  { capture: true, status: 503 },
])(
  "本文収集$capture・hosted応答$statusでも実Agentとtoolを維持し両送信先を照合する",
  async ({ capture, status }) => {
    // Given: 実Mastraと業務toolを使い、モデルと観測先のHTTP応答だけを固定する。
    await setupFixture();
    const bindings = {
      ...env,
      TABLECAST_ENV: "preview",
      TABLECAST_PR_NUMBER: "66",
      TABLECAST_OTEL_CAPTURE_CONTENT: String(capture),
      TABLECAST_OTEL_ENDPOINT: "https://tablecast-grafana.test/otlp",
      TABLECAST_MASTRA_ACCESS_TOKEN: "tablecast-hosted-secret",
      TABLECAST_MASTRA_PROJECT_ID: "tablecast-observability",
      TABLECAST_MASTRA_ENDPOINT: "https://tablecast-mastra.test",
      TABLECAST_MODEL_API_KEY: "tablecast-model-secret",
      TABLECAST_MODEL: "gpt-5.6-luna",
    };
    const sent: ReadableSpan[] = [];
    vi.spyOn(OTLPExporter.prototype, "export").mockImplementation((spans, callback) => {
      sent.push(...spans);
      callback({ code: 0 });
    });
    const hosted: unknown[] = [];
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://tablecast-mastra.test/")) {
        const body: unknown = JSON.parse(typeof init?.body === "string" ? init.body : "null");
        hosted.push(body);
        return Response.json({}, { status });
      }
      if (url.startsWith("https://tablecast-grafana.test/")) return Response.json({});
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      const first = calls++ === 0;
      return Response.json({
        id: "tablecast-completion",
        object: "chat.completion",
        created: 1,
        model: "gpt-5.6-luna",
        choices: [
          {
            index: 0,
            finish_reason: first ? "tool_calls" : "stop",
            message: first
              ? {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "tablecast-call",
                      type: "function",
                      function: { name: "getCatalog", arguments: "{}" },
                    },
                  ],
                }
              : { role: "assistant", content: "顧客向けの回答 tablecast-model-secret" },
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      });
    });
    const app = new Hono<ApiEnv>().get("/probe", async (c) => {
      const { agent, observability } = createCastAgent(
        createApiServices(c.env),
        {
          ...device,
          voiceSessionId: "tablecast-session-probe",
          turnId: "tablecast-turn-probe",
        },
        "ja",
        new AbortController().signal,
      );
      const requestContext = new RequestContext();
      requestContext.set("actor", { ...device, displayName: "診断用の顧客" });
      requestContext.set("diagnostics", { requestId: "tablecast-context-probe" });
      requestContext.set("authorization", "Bearer tablecast-context-secret");
      const output = await agent.generate("顧客の会話", { maxSteps: 2, requestContext });
      c.executionCtx.waitUntil(observability.shutdown());
      return c.text(output.text);
    });
    const worker = instrument(
      { fetch: (request, workerEnv, execution) => app.fetch(request, workerEnv, execution) },
      // Worker SDKはisolateの初回providerを共有する。送信層を収集可に固定し、
      // Mastra自身のprocessorがoffの本文を両宛先から除去することを検証する。
      (workerEnv) =>
        telemetryConfig({ ...workerEnv, TABLECAST_OTEL_CAPTURE_CONTENT: "true" }, "tablecast-api"),
    );
    const execution = createExecutionContext();
    if (!worker.fetch) throw new Error("Workerの入口がありません。");
    // When: HTTP要求からモデル→実カタログtool→モデルを実行し、要求終了後のflushを待つ。
    const response = await worker.fetch(
      new Request("https://tablecast.test/probe"),
      bindings,
      execution,
    );
    expect(await response.text()).toBe("顧客向けの回答 tablecast-model-secret");
    await waitOnExecutionContext(execution);
    // Then: 送信障害は業務結果を変えず、両宛先で秘密値を除去して相関を維持する。
    expect(calls).toBe(2);
    expect(hosted.length).toBeGreaterThan(0);
    const grafana = sent.filter((span) => typeof span.attributes["mastra.span.type"] === "string");
    expect(grafana.length).toBeGreaterThan(2);
    for (const payload of [JSON.stringify(grafana), JSON.stringify(hosted)]) {
      expect(payload).not.toContain("tablecast-model-secret");
      expect(payload).not.toContain("tablecast-hosted-secret");
      expect(payload).not.toContain("tablecast-context-secret");
      expect(payload.includes("顧客の会話")).toBe(capture);
      expect(payload.includes("診断用の顧客")).toBe(capture);
      expect(payload.includes("tablecast-context-probe")).toBe(capture);
      expect(payload).toContain("gpt-5.6-luna");
    }
    expect(new Set(grafana.map((span) => span.spanContext().traceId)).size).toBe(1);
    expect(new Set(grafana.map((span) => span.spanContext().spanId)).size).toBe(grafana.length);
    expect(JSON.stringify(hosted)).toContain(grafana[0]?.spanContext().traceId);
    expect(JSON.stringify(hosted)).toContain("tablecast-session-probe");
  },
);
