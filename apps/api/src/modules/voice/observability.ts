import type { SpanOutputProcessor } from "@mastra/core/observability";
import { Observability, MastraPlatformExporter, SensitiveDataFilter } from "@mastra/observability";
import { OtelBridge } from "@mastra/otel-bridge";
import { telemetryContent } from "../../platform/telemetry";
import type { TelemetryEnv } from "../../platform/telemetry";
import type { Actor } from "../auth/model";

interface MastraTelemetryEnv extends TelemetryEnv {
  TABLECAST_MASTRA_ACCESS_TOKEN?: string;
  TABLECAST_MASTRA_PROJECT_ID?: string;
  TABLECAST_MASTRA_ENDPOINT?: string;
}

export function castObservability(env: MastraTelemetryEnv, actor: Actor) {
  const credentials = new SensitiveDataFilter({
    sensitiveFields: [
      "authorization",
      "cookie",
      "password",
      "secret",
      "token",
      "apiKey",
      "accessToken",
      "refreshToken",
      "clientSecret",
    ],
  });
  const processor: SpanOutputProcessor = {
    name: "tablecast-content",
    process(span) {
      if (!span) return span;
      credentials.process(span);
      const capture = env.TABLECAST_OTEL_CAPTURE_CONTENT === "true";
      span.input = capture ? telemetryContent<unknown>(span.input, env) : undefined;
      span.output = capture ? telemetryContent<unknown>(span.output, env) : undefined;
      span.requestContext = capture ? telemetryContent(span.requestContext, env) : undefined;
      span.metadata = {
        // 導入版OtelBridgeはrequestContextを変換しないため、共通metadataにも渡す。
        ...(span.requestContext ? { requestContext: span.requestContext } : {}),
        "deployment.environment.name": env.TABLECAST_ENV ?? "development",
        "service.version": env.TABLECAST_RELEASE_SHA ?? "local",
        ...(env.TABLECAST_ENV === "preview"
          ? { "tablecast.pr.number": env.TABLECAST_PR_NUMBER }
          : {}),
        "tablecast.voice.session.id": actor.voiceSessionId,
        "tablecast.voice.turn.id": actor.turnId,
      };
      if (span.attributes) {
        if (capture) span.attributes = telemetryContent(span.attributes, env);
        else {
          // モデル・使用量・結果・時間だけを残し、promptやtool定義・payloadを除去する。
          const allowed = new Set([
            "model",
            "provider",
            "usage",
            "finishReason",
            "streaming",
            "completionStartTime",
            "responseModel",
            "toolName",
            "success",
          ]);
          span.attributes = Object.fromEntries(
            Object.entries(span.attributes).filter(([key]) => allowed.has(key)),
          );
        }
      }
      if (span.errorInfo)
        span.errorInfo = capture
          ? telemetryContent(span.errorInfo, env)
          : { ...span.errorInfo, message: "[REDACTED]", stack: undefined, details: undefined };
      return span;
    },
    shutdown: async () => {},
  };
  return new Observability({
    configs: {
      tablecast: {
        serviceName: "tablecast-api",
        bridge: new OtelBridge(),
        exporters:
          env.TABLECAST_MASTRA_ACCESS_TOKEN && env.TABLECAST_MASTRA_PROJECT_ID
            ? [
                new MastraPlatformExporter({
                  accessToken: env.TABLECAST_MASTRA_ACCESS_TOKEN,
                  projectId: env.TABLECAST_MASTRA_PROJECT_ID,
                  endpoint: env.TABLECAST_MASTRA_ENDPOINT ?? "https://observability.mastra.ai",
                  // 導入版SDKでは初回を含む試行回数。0では送信しない。
                  maxRetries: 1,
                }),
              ]
            : [],
        spanOutputProcessors: [processor],
        includeInternalSpans: true,
        logging: { enabled: false },
      },
    },
    sensitiveDataFilter: false,
  });
}
