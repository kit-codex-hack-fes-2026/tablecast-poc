import {
  ConsoleTransport,
  getLogger,
  OTLPExporter,
  OTLPTransport,
  type LogTransport,
  type WorkerOtelConfig,
} from "@inference-net/otel-cf-workers";
import { SpanStatusCode, trace, type Attributes } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

export interface TelemetryEnv {
  TABLECAST_ENV?: string;
  TABLECAST_RELEASE_SHA?: string;
  TABLECAST_PR_NUMBER?: string;
  TABLECAST_OTEL_ENDPOINT?: string;
  TABLECAST_OTEL_AUTHORIZATION?: string;
}

// 自動計測はURL・SQL・ヘッダーを含むため、送信境界で許可した属性だけを残す。
const allowed = new Set([
  "http.request.method",
  "http.method",
  "http.response.status_code",
  "http.status_code",
  "http.route",
  "db.system",
  "db.system.name",
  "cloudflare.d1.response.rows_read",
  "cloudflare.d1.response.rows_written",
  "cloudflare.d1.response.sql_duration_ms",
  "db.operation",
  "db.operation.name",
  "faas.coldstart",
  "tablecast.request.id",
  "tablecast.duration_ms",
  "tablecast.error.code",
]);
export function telemetryAttributes(attributes: Record<string, unknown>): Attributes {
  const result: Attributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (
      allowed.has(key) &&
      (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    )
      result[key] = value;
  }
  return result;
}

export function telemetryConfig(env: TelemetryEnv, service: string): WorkerOtelConfig {
  const resource = resourceFromAttributes({
    "service.namespace": "tablecast",
    "service.name": service,
    "service.version": env.TABLECAST_RELEASE_SHA ?? "local",
    "deployment.environment.name": env.TABLECAST_ENV ?? "development",
    ...(env.TABLECAST_ENV === "preview" && env.TABLECAST_PR_NUMBER
      ? { "tablecast.pr.number": env.TABLECAST_PR_NUMBER }
      : {}),
  });
  const endpoint = env.TABLECAST_OTEL_ENDPOINT?.replace(/\/$/, "");
  const headers: Record<string, string> = env.TABLECAST_OTEL_AUTHORIZATION
    ? { Authorization: env.TABLECAST_OTEL_AUTHORIZATION }
    : {};
  const traceTransport = endpoint
    ? new OTLPExporter({ url: `${endpoint}/v1/traces`, headers })
    : undefined;
  const logTransport = endpoint
    ? new OTLPTransport({ url: `${endpoint}/v1/logs`, headers })
    : undefined;
  const consoleTransport = new ConsoleTransport({ pretty: false });
  const exporter: SpanExporter = {
    export(spans, callback) {
      if (!traceTransport) {
        callback({ code: 0 });
        return;
      }
      traceTransport.export(
        spans.map((span): ReadableSpan => ({
          ...span,
          // spanContextはprototype上のメソッドなので明示的に引き継ぐ。
          spanContext: () => span.spanContext(),
          name: /^tablecast\.[a-z_.]+$/.test(span.name)
            ? span.name
            : span.attributes["http.request.method"] || span.attributes["http.method"]
              ? "HTTP"
              : span.attributes["db.system"] || span.attributes["db.system.name"]
                ? "DB"
                : "Worker binding",
          resource,
          attributes: telemetryAttributes(span.attributes),
          events: [],
          links: [],
          status: { code: span.status.code },
        })),
        callback,
      );
    },
    shutdown: () => traceTransport?.shutdown() ?? Promise.resolve(),
  };
  const logs: LogTransport = {
    name: "tablecast-safe-logs",
    export(records, callback) {
      const safe = records
        .filter(
          (record) => typeof record.body === "string" && /^tablecast\.[a-z_.]+$/.test(record.body),
        )
        .map((record) => ({
          ...record,
          resource,
          attributes: telemetryAttributes(record.attributes),
        }));
      consoleTransport.export(safe, () => {});
      if (logTransport) logTransport.export(safe, callback);
      else callback({ code: 0 });
    },
    shutdown: () => logTransport?.shutdown() ?? Promise.resolve(),
  };
  return {
    service: {
      name: service,
      namespace: "tablecast",
      version: env.TABLECAST_RELEASE_SHA ?? "local",
    },
    trace: {
      exporter,
      sampling: {
        headSampler: { ratio: env.TABLECAST_ENV === "production" ? 0.1 : 1, acceptRemote: false },
      },
      fetch: { includeTraceContext: false },
      instrumentation: { instrumentGlobalFetch: false, instrumentGlobalCache: false },
      batching: { strategy: "trace" },
    },
    logs: {
      transports: [logs],
      instrumentation: { instrumentConsole: false },
      batching: { strategy: "size", maxQueueSize: 256, maxExportBatchSize: 64 },
    },
  };
}

export async function measured<T>(
  name: `tablecast.${string}`,
  operation: () => Promise<T>,
): Promise<T> {
  if (!trace.getActiveSpan()) return operation();
  return trace.getTracer("tablecast").startActiveSpan(name, async (span) => {
    try {
      return await operation();
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function requestLog(attributes: Attributes, failed: boolean) {
  const logger = getLogger("tablecast");
  if (failed) logger.error("tablecast.request_completed", telemetryAttributes(attributes));
  else logger.info("tablecast.request_completed", telemetryAttributes(attributes));
}
