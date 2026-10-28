import { type Attributes, context, SpanStatusCode, trace } from "@opentelemetry/api";
import { telemetryLog } from "./telemetry";
import { telemetryAttributes, type TelemetryEnv } from "./telemetry-content";

export function llmSessionId(env: TelemetryEnv, sessionId: string) {
  return `${env.TABLECAST_ENV ?? "development"}:${env.TABLECAST_WORKTREE_ID || env.TABLECAST_PR_NUMBER || "shared"}:${sessionId}`;
}

// 受信した公開eventの時刻を使い、HTTP処理時間とモデル時間を分ける。
export function recordLlmObservation(
  env: TelemetryEnv,
  name: `tablecast.${string}`,
  attributes: Attributes,
  startedAt = Date.now(),
  endedAt = startedAt,
) {
  try {
    const safe = telemetryAttributes(attributes, env);
    const span = trace.getTracer("tablecast").startSpan(name, {
      startTime: new Date(startedAt),
      attributes: safe,
    });
    if (safe["tablecast.outcome"] === "error") span.setStatus({ code: SpanStatusCode.ERROR });
    context.with(trace.setSpan(context.active(), span), () =>
      telemetryLog("tablecast.voice_observation", safe, false, env),
    );
    span.end(new Date(endedAt));
  } catch {
    console.warn("TableCast voice observation recording failed");
  }
}

export async function recordLlmConfiguration(
  env: TelemetryEnv,
  visitId: string,
  voiceSessionId: string,
  configuration: unknown,
) {
  if (env.TABLECAST_ENV === "production") return;
  try {
    const snapshot = JSON.stringify(configuration);
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(snapshot));
    recordLlmObservation(env, "tablecast.voice.configuration", {
      "tablecast.observation.type": "event",
      "tablecast.session.id": llmSessionId(env, visitId),
      "tablecast.voice.session.id": voiceSessionId,
      "tablecast.prompt.hash": Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
      "gen_ai.request.model": env.TABLECAST_MODEL,
      "tablecast.input": snapshot,
    });
  } catch {
    // 観測用のserialization・hash・export失敗を接客の失敗へ変換しない。
  }
}
