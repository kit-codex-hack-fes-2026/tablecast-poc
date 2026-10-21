import { type Attributes } from "@opentelemetry/api";
import { redactCredentials } from "./diagnostics";

export interface TelemetryEnv {
  TABLECAST_ENV?: string;
  TABLECAST_OTEL_AUTHORIZATION?: string;
  TABLECAST_OTEL_CAPTURE_CONTENT?: string;
  TABLECAST_OTEL_ENDPOINT?: string;
  TABLECAST_PR_NUMBER?: string;
  TABLECAST_RELEASE_SHA?: string;
}

// 自動計測はURL・SQL・ヘッダーを含むため、送信境界で許可した属性だけを残す。
export const allowed = new Set([
  "tablecast.voice.session.id",
  "tablecast.voice.turn.id",
  "tablecast.agent.session.id",
  "tablecast.tool.name",
  "tablecast.tool.call.id",
  "tablecast.tool.output_bytes",
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
  "cloudflare.colo",
  "cloudflare.placement",
  "cloudflare.d1.response.rows_read",
  "cloudflare.d1.response.rows_written",
  "cloudflare.d1.response.sql_duration_ms",
  "cloudflare.d1.response.served_by_region",
  "cloudflare.d1.response.served_by_primary",
  "cloudflare.d1.response.total_attempts",
  "db.operation",
  "db.operation.name",
  "faas.coldstart",
  "tablecast.request.id",
  "tablecast.duration_ms",
  "tablecast.error.code",
  "tablecast.error.phase",
]);

const diagnosticKeys = new Set([
  "tablecast.error.sanitized",
  "exception.type",
  "exception.message",
  "exception.stacktrace",
  "tablecast.error.causes",
]);

const credentialKey = /authorization|cookie|password|secret|api[_-]?key|token$/i;

// 顧客情報の収集設定に関係なく、認証資格と現在のbindingの秘密値は除去する。
export function telemetryContent(value: string, env: TelemetryEnv): string;

export function telemetryContent<T>(value: T, env: TelemetryEnv): T;

export function telemetryContent(value: unknown, env: TelemetryEnv): unknown {
  // envの列挙はbindingの計測Proxyも作るため、本文の各値で繰り返さない。
  const secrets = Object.entries(env).flatMap(([key, secret]) =>
    credentialKey.test(key) && typeof secret === "string" && secret.length >= 8 ? [secret] : [],
  );
  function sanitize(item: unknown): unknown {
    if (typeof item === "string") {
      const start = item.trimStart()[0];
      if (start === "{" || start === "[") {
        try {
          const parsed: unknown = JSON.parse(item);
          if (parsed && typeof parsed === "object") return JSON.stringify(sanitize(parsed));
        } catch {
          // JSON候補が通常の文だった場合も資格情報を除去する。
        }
      }
      return redactCredentials(item, secrets);
    }
    if (item instanceof Date) return item;
    if (Array.isArray(item)) return item.map(sanitize);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item).map(([key, entry]) => [
          key,
          credentialKey.test(key) ? "[REDACTED]" : sanitize(entry),
        ]),
      );
    return item;
  }
  return sanitize(value);
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
        (attributes["tablecast.error.sanitized"] === true && diagnosticKeys.has(key)) ||
        /^gen_ai\.(usage\.|response\.model|request\.model|provider\.name|operation\.name)/.test(
          key,
        ) ||
        (env.TABLECAST_OTEL_CAPTURE_CONTENT === "true" &&
          /^(exception\.|db\.(statement|query\.text)|tablecast\.(input|output)|gen_ai\.)/.test(
            key,
          ))) &&
      (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    )
      result[key] = typeof value === "string" ? telemetryContent(value, env) : value;
  }
  return result;
}
