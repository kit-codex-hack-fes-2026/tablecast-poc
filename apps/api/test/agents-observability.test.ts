import { trace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterEach, expect, it, vi } from "vitest";
import { voiceGenerationSpan } from "../src/modules/voice/observability";
import { telemetryAttributes } from "../src/platform/telemetry";
import { device } from "./fixture";

afterEach(() => vi.restoreAllMocks());
it.each([false, true])(
  "Agents本文収集%sでも資格を除去し、モデル・音声turnの相関を維持する",
  async (capture) => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    vi.spyOn(trace, "getTracer").mockReturnValue(provider.getTracer("tablecast-test"));
    const bindings = {
      TABLECAST_MODEL: "gpt-6-astra",
      TABLECAST_MODEL_API_KEY: "tablecast-secret-model-key",
      TABLECAST_OTEL_CAPTURE_CONTENT: String(capture),
    };
    const span = voiceGenerationSpan(
      bindings,
      { ...device, voiceSessionId: "tablecast-voice", turnId: "tablecast-turn" },
      "顧客の会話 tablecast-secret-model-key",
    );
    span.end();
    await provider.forceFlush();
    const saved = exporter.getFinishedSpans()[0];
    expect(saved?.name).toBe("tablecast.voice.agent");
    const attributes = telemetryAttributes(saved?.attributes ?? {}, bindings);
    expect(attributes).toMatchObject({
      "gen_ai.request.model": "gpt-6-astra",
      "tablecast.voice.session.id": "tablecast-voice",
      "tablecast.voice.turn.id": "tablecast-turn",
    });
    const output = JSON.stringify(attributes);
    expect(output.includes("顧客の会話")).toBe(capture);
    expect(output).not.toContain("tablecast-secret-model-key");
    await provider.shutdown();
  },
);
