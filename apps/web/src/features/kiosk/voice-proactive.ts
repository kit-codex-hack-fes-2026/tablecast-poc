import { z } from "zod";
import type { VoiceRuntime } from "./voice-runtime";
import { parseResponse } from "../../lib/api";
export function scheduleProactive(runtime: VoiceRuntime, attempt: number) {
  clearTimeout(runtime.proactiveTimer);
  if (!runtime.proactive || !runtime.ready || !runtime.current(attempt)) return;
  runtime.proactiveTimer = setTimeout(() => {
    if (!runtime.delegation) void runtime.proactiveSuggestion(attempt);
  }, 180000);
}

export async function proactiveSuggestion(runtime: VoiceRuntime, attempt: number) {
  const delegationId = runtime.activeDelegation;
  const turnId = await runtime.registerDelegation(null, "proactive", attempt);
  if (!turnId || !runtime.sessionId || !runtime.current(attempt)) return;
  const sessionId = runtime.sessionId;
  try {
    const result = await parseResponse(
      runtime.client.voice.tools.$post({
        json: {
          voiceSessionId: sessionId,
          turnId,
          toolName: "getCatalog",
          toolCallId: crypto.randomUUID(),
          arguments: {},
        },
      }),
    );
    const catalog = z
      .object({
        products: z.array(
          z.object({
            displayName: z.string(),
            description: z.string(),
            price: z.number(),
            available: z.boolean(),
          }),
        ),
      })
      .parse(result.result);
    const product = catalog.products.find((item) => item.available);
    if (product && runtime.current(attempt) && runtime.activeDelegation === delegationId)
      runtime.channel?.send(
        JSON.stringify({
          type: "session.commentary.append",
          event_id: crypto.randomUUID(),
          delegation_id: null,
          content: `店舗が許可した自発接客です。次の登録商品の紹介を一文だけ伝えてください。注文操作はしません。${JSON.stringify(product)}`,
        }),
      );
    await parseResponse(
      runtime.client.voice.finish.$post({
        json: { voiceSessionId: sessionId, turnId, status: "completed" },
      }),
    );
  } catch {
    runtime.onSync();
  }
}
