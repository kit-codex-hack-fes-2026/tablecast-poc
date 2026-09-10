import {
  getLogger,
  OTLPExporter,
  OTLPTransport,
  type LogTransport,
  type WorkerOtelConfig,
} from "@inference-net/otel-cf-workers";
import {
  context,
  createContextKey,
  SpanStatusCode,
  trace,
  type Attributes,
} from "@opentelemetry/api";
import { DomainError } from "./errors";
import { resourceFromAttributes } from "@opentelemetry/resources";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";

export interface TelemetryEnv {
  TABLECAST_ENV?: string;
  TABLECAST_RELEASE_SHA?: string;
  TABLECAST_PR_NUMBER?: string;
  TABLECAST_OTEL_ENDPOINT?: string;
  TABLECAST_OTEL_AUTHORIZATION?: string;
  TABLECAST_OTEL_CAPTURE_CONTENT?: string;
}

// 自動計測はURL・SQL・ヘッダーを含むため、送信境界で許可した属性だけを残す。
const allowed = new Set([
  "tablecast.operation",
  "tablecast.channel",
  "tablecast.outcome",
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
const credentialKey =
  /authorization|cookie|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|^token$/i;

// 顧客情報の収集設定に関係なく、認証資格と現在のbindingの秘密値は除去する。
export function telemetryContent(value: string, env: TelemetryEnv): string;
export function telemetryContent(value: unknown, env: TelemetryEnv): unknown;
export function telemetryContent(value: unknown, env: TelemetryEnv): unknown {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object")
        return JSON.stringify(telemetryContent(parsed, env));
    } catch {
      // 通常の文はJSONとして解釈しない。
    }
    let safe = value
      .replace(/\b(Bearer|Basic)\s+[^\s"',;]+/gi, "$1 [REDACTED]")
      .replace(/(\b(?:authorization|(?:set-)?cookie)\s*[=:]\s*)[^\r\n]+/gi, "$1[REDACTED]");
    for (const [key, secret] of Object.entries(env))
      if (credentialKey.test(key) && typeof secret === "string" && secret.length >= 8)
        safe = safe.replaceAll(secret, "[REDACTED]");
    return safe.replace(
      /((?:password|api[_-]?key|access[_-]?token|refresh[_-]?token|secret)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
  }
  if (Array.isArray(value)) return value.map((item) => telemetryContent(item, env));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        credentialKey.test(key) ? "[REDACTED]" : telemetryContent(item, env),
      ]),
    );
  return value;
}

export function telemetryAttributes(
  attributes: Record<string, unknown>,
  env: TelemetryEnv = {},
): Attributes {
  const result: Attributes = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (credentialKey.test(key)) continue;
    if (
      (allowed.has(key) ||
        (env.TABLECAST_OTEL_CAPTURE_CONTENT === "true" &&
          /^(exception\.|db\.(statement|query\.text)|tablecast\.(input|output)|gen_ai\.|lk\.|mastra\.)/.test(
            key,
          ))) &&
      (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    )
      result[key] = typeof value === "string" ? telemetryContent(value, env) : value;
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
          attributes: telemetryAttributes(span.attributes, env),
          events:
            env.TABLECAST_OTEL_CAPTURE_CONTENT === "true"
              ? span.events.map((event) => ({
                  ...event,
                  name: telemetryContent(event.name, env),
                  attributes: telemetryAttributes(event.attributes ?? {}, env),
                }))
              : [],
          links: [],
          status: {
            code: span.status.code,
            ...(env.TABLECAST_OTEL_CAPTURE_CONTENT === "true" && span.status.message
              ? { message: telemetryContent(span.status.message, env) }
              : {}),
          },
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
        .flatMap((record) => {
          const attributes = telemetryAttributes(record.attributes, env);
          const content = Object.fromEntries(
            Object.entries(attributes).filter(([key]) => !allowed.has(key)),
          );
          const metadata = Object.fromEntries(
            Object.entries(attributes).filter(([key]) => allowed.has(key)),
          );
          const completed = { ...record, resource, attributes: metadata };
          if (Object.keys(content).length === 0) return [completed];
          // Lokiの64 KiB属性上限を避ける。Unicodeを壊さず本文へ分割し、
          // 256 KiB行上限にも収める。完了ログは一件のまま集計する。
          const parts = JSON.stringify(content).match(/.{1,16000}/gsu) ?? [];
          return [
            completed,
            ...parts.map((part, index) => ({
              ...completed,
              body: JSON.stringify({
                event: "tablecast.content",
                part: index + 1,
                parts: parts.length,
                content: part,
              }),
            })),
          ];
        });
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
        headSampler: { ratio: 1, acceptRemote: false },
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

export const telemetryChannel = createContextKey("tablecast.channel");

// 操作全体の完了ログはtraceのsamplingとは独立させ、集計の母数を保つ。
export async function observeOperation<T>(
  name: `tablecast.${string}`,
  operation: () => Promise<T>,
  options?: { env: TelemetryEnv; input: unknown },
): Promise<T> {
  if (!trace.getActiveSpan()) return operation();
  return measured(name, async () => {
    const started = performance.now();
    let outcome = "success";
    let code: string | undefined;
    const content: Attributes = {};
    const capture = options?.env.TABLECAST_OTEL_CAPTURE_CONTENT === "true";
    if (capture)
      content["tablecast.input"] = JSON.stringify(telemetryContent(options.input, options.env));
    try {
      const result = await operation();
      if (capture)
        content["tablecast.output"] = JSON.stringify(telemetryContent(result, options.env));
      return result;
    } catch (error) {
      outcome = error instanceof DomainError && error.status < 500 ? "rejected" : "error";
      code = error instanceof DomainError ? error.code : "INTERNAL_ERROR";
      if (capture && error instanceof Error) {
        content["exception.type"] = error.name;
        content["exception.message"] = telemetryContent(error.message, options.env);
        if (error.stack)
          content["exception.stacktrace"] = telemetryContent(error.stack, options.env);
      }
      throw error;
    } finally {
      const channel = context.active().getValue(telemetryChannel);
      const attributes = {
        ...content,
        "tablecast.operation": name,
        "tablecast.channel": typeof channel === "string" ? channel : "internal",
        "tablecast.outcome": outcome,
        "tablecast.duration_ms": performance.now() - started,
        ...(code ? { "tablecast.error.code": code } : {}),
      };
      trace.getActiveSpan()?.setAttributes(attributes);
      telemetryLog("tablecast.operation_completed", attributes, outcome === "error", options?.env);
    }
  });
}

export function requestLog(attributes: Attributes, failed: boolean, env: TelemetryEnv = {}) {
  telemetryLog("tablecast.request_completed", attributes, failed, env);
}

export function telemetryLog(
  event: `tablecast.${string}`,
  attributes: Attributes,
  failed = false,
  env: TelemetryEnv = {},
) {
  const safe = telemetryAttributes(attributes, env);
  const span = trace.getActiveSpan()?.spanContext();
  // 標準出力は要求内で確定する。後処理へ遅延させるのはOTLP送信だけ。
  const entry = JSON.stringify({
    event,
    attributes: safe,
    trace_id: span?.traceId,
    span_id: span?.spanId,
  });
  if (failed) console.error(entry);
  else console.info(entry);
  const logger = getLogger("tablecast");
  if (failed) logger.error(event, safe);
  else logger.info(event, safe);
}
