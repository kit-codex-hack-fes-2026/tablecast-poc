import type { Attributes } from "@opentelemetry/api";
import { DomainError } from "./errors";

// 本文収集を無効にした場合、providerのcauseは型と位置だけを残す。
const privateCauses = new Set([
  "INVALID_INPUT",
  "VOICE_CATALOG_UNAVAILABLE",
  "VOICE_ROOM_STOP_FAILED",
  "VOICE_RUNTIME_UNAVAILABLE",
  "VOICE_MODEL_FAILED",
  "VOICE_INTERNAL_ERROR",
]);
function diagnosticMessage(message: string, secrets: readonly string[], capture: boolean) {
  let value = message;
  for (const secret of secrets) if (secret) value = value.replaceAll(secret, "[REDACTED]");
  value = value
    .replace(/\b(Bearer|Basic)\s+[^\s"',;]+/gi, "$1 [REDACTED]")
    .replace(/(\b(?:authorization|(?:set-)?cookie)\s*[=:]\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(
      /((?:password|api[_-]?key|access[_-]?token|refresh[_-]?token|secret|token|code)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
  if (capture) return value.slice(0, 4096);
  return (value.split("\n", 1)[0] ?? "")
    .replace(/Failed query:[\s\S]*/i, "Failed query: [REDACTED]")
    .replace(/\bparams:[\s\S]*/i, "params: [REDACTED]")
    .replace(/https?:\/\/\S+/gi, "[REDACTED_URL]")
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;]+/gi, "[REDACTED_AUTH]")
    .replace(
      /\b(?:cookie|authorization|password|token|secret|code)\s*[:=]\s*[^\s,;]+/gi,
      "[REDACTED_CREDENTIAL]",
    )
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[REDACTED_EMAIL]")
    .replace(/"[^"\n]*"|'[^'\n]*'|`[^`\n]*`/g, "[REDACTED_VALUE]")
    .slice(0, 1024);
}

export function errorAttributes(
  error: unknown,
  secrets: readonly string[] = [],
  capture = false,
): Attributes {
  const exceptions: { type: string; message: string; stack: string }[] = [];
  const seen = new Set<Error>();
  let hideMessage = false;
  while (error instanceof Error && !seen.has(error) && exceptions.length < 5) {
    seen.add(error);
    const type = diagnosticMessage(error.name, secrets, capture).slice(0, 100);
    const message = hideMessage
      ? "[REDACTED_PROVIDER_MESSAGE]"
      : diagnosticMessage(error.message, secrets, capture);
    const header = error.message ? `${error.name}: ${error.message}` : error.name;
    const rawStack = error.stack?.startsWith(header) ? error.stack.slice(header.length) : "";
    const frames = rawStack
      .split("\n")
      .flatMap((line) => {
        if (!/^\s+at /.test(line)) return [];
        // メッセージ行・絶対パス・URL queryを除き、コード位置だけを記録する。
        const location = /(?:^|[/\\( ])([\w.-]{1,100}\.[cm]?[jt]s:\d+:\d+)\)?$/.exec(line);
        return location?.[1] ? [`    at ${location[1]}`] : [];
      })
      .slice(0, 12);
    exceptions.push({ type, message, stack: [`${type}: ${message}`, ...frames].join("\n") });
    hideMessage ||= !capture && error instanceof DomainError && privateCauses.has(error.code);
    error = error.cause;
  }
  const first = exceptions[0];
  return {
    "tablecast.error.sanitized": true,
    "exception.type": first?.type ?? "NonError",
    "exception.message": first?.message ?? "[REDACTED_NON_ERROR]",
    "exception.stacktrace": first?.stack ?? "",
    ...(exceptions.length > 1
      ? { "tablecast.error.causes": JSON.stringify(exceptions.slice(1)) }
      : {}),
  };
}

export function diagnosticSecrets(env: object): string[] {
  return Object.entries(env).flatMap(([key, value]) =>
    /SECRET|TOKEN|KEY|AUTHORIZATION/.test(key) && typeof value === "string" ? [value] : [],
  );
}
