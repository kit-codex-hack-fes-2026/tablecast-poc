import { getLogger } from "@inference-net/otel-cf-workers";
import {
  type Attributes,
  context,
  createContextKey,
  propagation,
  SpanStatusCode,
  trace,
} from "@opentelemetry/api";
import { diagnosticSecrets, errorAttributes } from "./diagnostics";
import { DomainError } from "./errors";
import { telemetryAttributes, telemetryContent, type TelemetryEnv } from "./telemetry-content";

if (import.meta.hot) {
  // Viteの全再評価と同じ寿命で登録を解放し、古いSDKの設定キーを持ち越さない。
  import.meta.hot.on("vite:beforeFullReload", () => {
    trace.disable();
    context.disable();
    propagation.disable();
  });
}

export async function measured<T>(
  name: `tablecast.${string}`,
  operation: () => Promise<T>,
): Promise<T> {
  if (!trace.getActiveSpan()) return operation();
  return trace.getTracer("tablecast").startActiveSpan(name, async (span) => {
    const started = performance.now();
    try {
      return await operation();
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      recordTiming(name, performance.now() - started);
      span.end();
    }
  });
}

export const telemetryChannel = createContextKey("tablecast.channel");
export const telemetryTimings = createContextKey("tablecast.timings");

export function recordTiming(name: string, duration: number, description?: string) {
  const timings = context.active().getValue(telemetryTimings);
  if (timings instanceof Map) timings.set(name, { duration, description });
}

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
  const status = attributes["http.response.status_code"];
  telemetryLog(
    "tablecast.request_completed",
    {
      ...attributes,
      "tablecast.outcome": failed
        ? "error"
        : typeof status === "number" && status >= 400
          ? "rejected"
          : "success",
    },
    failed,
    env,
  );
}

export function telemetryLog(
  event: `tablecast.${string}`,
  attributes: Attributes,
  failed: "warn" | boolean = false,
  env: TelemetryEnv = {},
) {
  const level =
    failed === "warn"
      ? "warn"
      : failed
        ? "error"
        : attributes["tablecast.outcome"] === "rejected"
          ? "warn"
          : "info";
  const safe = telemetryAttributes(attributes, env);
  const span = trace.getActiveSpan()?.spanContext();
  // 標準出力は要求内で確定する。後処理へ遅延させるのはOTLP送信だけ。
  const entry = JSON.stringify({
    event,
    releaseSha: env.TABLECAST_RELEASE_SHA ?? "local",
    attributes: safe,
    trace_id: span?.traceId,
    span_id: span?.spanId,
  });
  console[level](entry);
  const logger = getLogger("tablecast");
  logger[level](event, safe);
}

// 応答開始後・回復可能な失敗も、要求と同じ送信境界を通す。
export function failureLog(
  event: `tablecast.${string}`,
  error: unknown,
  env: TelemetryEnv,
  attributes: Attributes = {},
) {
  const diagnostic = errorAttributes(
    error,
    diagnosticSecrets(env),
    env.TABLECAST_OTEL_CAPTURE_CONTENT === "true",
  );
  trace.getActiveSpan()?.addEvent("exception", diagnostic);
  telemetryLog(event, { ...attributes, ...diagnostic }, "warn", env);
}
export type { TelemetryEnv } from "./telemetry-content";
export { telemetryConfig } from "./telemetry-export";
