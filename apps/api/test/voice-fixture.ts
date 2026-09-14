import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { voiceTurnSchema } from "../src/modules/voice/model";
import { startVoiceTurn } from "../src/modules/voice/turns";
import { createApiServices } from "../src/platform/context";
export const voiceBindings = () => ({
  ...env,
  TABLECAST_MODEL_API_KEY: "tablecast-test-key",
  TABLECAST_MODEL: "gpt-5.6-luna",
});
export async function runVoiceTurn(input: unknown, bindings = voiceBindings()) {
  const ctx = createExecutionContext();
  const result = await startVoiceTurn(
    createApiServices(bindings),
    voiceTurnSchema.parse(input),
    { traceId: "tablecast-test", releaseSha: "tablecast-test" },
    new AbortController().signal,
    ctx.waitUntil.bind(ctx),
  );
  return { result, finish: () => waitOnExecutionContext(ctx) };
}
