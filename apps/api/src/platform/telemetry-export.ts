import {
  type LogTransport,
  OTLPExporter,
  OTLPTransport,
  type WorkerOtelConfig,
} from "@inference-net/otel-cf-workers";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import type { TelemetryEnv } from "./telemetry-content";
import { allowed, telemetryAttributes, telemetryContent } from "./telemetry-content";

export function telemetryConfig(env: TelemetryEnv, service: string): WorkerOtelConfig {
  const resource = resourceFromAttributes({
    "service.namespace": "tablecast",
    "service.name": service,
    "service.version": env.TABLECAST_RELEASE_SHA ?? "local",
    "deployment.environment.name": env.TABLECAST_ENV ?? "development",
    ...(env.TABLECAST_WORKTREE_ID
      ? {
          "tablecast.worktree.id": env.TABLECAST_WORKTREE_ID,
          "tablecast.worktree.name": env.TABLECAST_WORKTREE_NAME ?? env.TABLECAST_WORKTREE_ID,
        }
      : {}),
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
  const langfuse =
    env.TABLECAST_ENV !== "production" &&
    env.TABLECAST_LANGFUSE_BASE_URL &&
    env.TABLECAST_LANGFUSE_PUBLIC_KEY &&
    env.TABLECAST_LANGFUSE_SECRET_KEY
      ? new OTLPExporter({
          url: `${env.TABLECAST_LANGFUSE_BASE_URL.replace(/\/$/, "")}/api/public/otel/v1/traces`,
          headers: {
            Authorization: `Basic ${btoa(`${env.TABLECAST_LANGFUSE_PUBLIC_KEY}:${env.TABLECAST_LANGFUSE_SECRET_KEY}`)}`,
            "x-langfuse-ingestion-version": "4",
          },
        })
      : undefined;
  const langfuseExporter: SpanExporter = {
    export(spans, callback) {
      // Grafanaと同じ秘匿化を先に通し、LLMに関係するspanだけを複製する。
      const observations = spans
        .filter((span) => span.attributes["tablecast.observation.type"])
        .map((span): ReadableSpan => {
          const attributes = telemetryAttributes(span.attributes, env);
          const {
            "tablecast.input": input,
            "tablecast.output": output,
            ...observationAttributes
          } = attributes;
          const metadata = { ...resource.attributes, ...attributes };
          return {
            ...span,
            spanContext: () => span.spanContext(),
            name: /^tablecast\.[a-z_.]+$/.test(span.name)
              ? span.name
              : "tablecast.voice.observation",
            resource,
            events: [],
            links: [],
            status: { code: span.status.code },
            attributes: {
              ...observationAttributes,
              "langfuse.observation.type": attributes["tablecast.observation.type"] ?? "span",
              "langfuse.version": env.TABLECAST_RELEASE_SHA ?? "local",
              "langfuse.session.id":
                attributes["tablecast.session.id"] ??
                attributes["tablecast.voice.session.id"] ??
                "",
              ...Object.fromEntries(
                Object.entries(metadata)
                  .filter(([key]) =>
                    /^(service\.|deployment\.|tablecast\.(worktree\.|pr\.|voice\.|response\.|delegation\.|tool\.|prompt\.|observation\.source))/.test(
                      key,
                    ),
                  )
                  .map(([key, value]) => [
                    `langfuse.observation.metadata.${key.replaceAll(".", "_")}`,
                    value,
                  ]),
              ),
              ...(input ? { "langfuse.observation.input": input } : {}),
              ...(output ? { "langfuse.observation.output": output } : {}),
            },
          };
        });
      if (!langfuse || !observations.length) {
        callback({ code: 0 });
        return;
      }
      langfuse.export(observations, callback);
    },
    shutdown: () => langfuse?.shutdown() ?? Promise.resolve(),
  };
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
          name: /^tablecast\.[a-z0-9_.]+$/.test(span.name)
            ? span.name
            : span.attributes["http.request.method"] || span.attributes["http.method"]
              ? "HTTP"
              : span.attributes["db.system"] || span.attributes["db.system.name"]
                ? "DB"
                : "Worker binding",
          resource,
          attributes: telemetryAttributes(span.attributes, env),
          events: span.events
            .filter(
              (event) =>
                env.TABLECAST_OTEL_CAPTURE_CONTENT === "true" ||
                (event.name === "exception" &&
                  event.attributes?.["tablecast.error.sanitized"] === true),
            )
            .map((event) => ({
              ...event,
              name: telemetryContent(event.name, env),
              attributes: telemetryAttributes(event.attributes ?? {}, env),
            })),
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
      // 完了済みtraceを保持する既定processorを避け、標準の上限付きqueueを使う。
      // Worker入口のwaitUntilからforceFlushされ、未完了spanを強制終了しない。
      spanProcessors: [
        new BatchSpanProcessor(exporter, { maxQueueSize: 512, maxExportBatchSize: 64 }),
        ...(langfuse
          ? [
              new BatchSpanProcessor(langfuseExporter, {
                maxQueueSize: 512,
                maxExportBatchSize: 64,
              }),
            ]
          : []),
      ],
      sampling: {
        headSampler: { ratio: 1, acceptRemote: false },
      },
      fetch: { includeTraceContext: false },
      instrumentation: { instrumentGlobalFetch: false, instrumentGlobalCache: false },
    },
    logs: {
      transports: [logs],
      instrumentation: { instrumentConsole: false },
      batching: { strategy: "size", maxQueueSize: 256, maxExportBatchSize: 64 },
    },
  };
}
