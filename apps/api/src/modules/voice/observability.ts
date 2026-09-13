import { trace } from "@opentelemetry/api";
import { telemetryContent } from "../../platform/telemetry";
import type { TelemetryEnv } from "../../platform/telemetry";
import type { Actor } from "../auth/model";

export function voiceGenerationSpan(
  env: TelemetryEnv & { TABLECAST_MODEL: string },
  actor: Actor,
  input: string,
) {
  return trace.getTracer("tablecast").startSpan("tablecast.voice.agent", {
    attributes: {
      "gen_ai.provider.name": "openai",
      "gen_ai.request.model": env.TABLECAST_MODEL,
      "gen_ai.operation.name": "agents.session",
      "tablecast.voice.session.id": actor.voiceSessionId,
      "tablecast.voice.turn.id": actor.turnId,
      ...(env.TABLECAST_OTEL_CAPTURE_CONTENT === "true"
        ? { "tablecast.input": telemetryContent(input, env) }
        : {}),
    },
  });
}
