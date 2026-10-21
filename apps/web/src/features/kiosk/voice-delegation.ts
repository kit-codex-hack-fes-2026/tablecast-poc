import { voiceToolNameSchema } from "@tablecast/api/schema";
import { z } from "zod";
import type { VoiceRuntime } from "./voice-runtime";
import { parseResponse } from "../../lib/api";
import { apiError } from "../../lib/api-error";
import { type PendingResponse, type responseEnvelope } from "./voice-events-model";
export async function registerDelegation(
  runtime: VoiceRuntime,
  id: null | string,
  trigger: "proactive" | "user",
  attempt: number,
): Promise<string | undefined> {
  if (!runtime.current(attempt) || !runtime.sessionId) return undefined;
  try {
    const response = await runtime.client.voice.delegations.$post(
      {
        json: {
          voiceSessionId: runtime.sessionId,
          delegationId: id,
          locale: runtime.locale,
          messages: [],
          trigger,
        },
      },
      { init: { signal: AbortSignal.timeout(10000) } },
    );
    if (response.status === 204) return undefined;
    return (await parseResponse(response)).turnId;
  } catch {
    if (runtime.current(attempt)) runtime.onSync();
    return undefined;
  }
}

export async function receiveResponse(
  runtime: VoiceRuntime,
  envelope: z.infer<typeof responseEnvelope>,
  attempt: number,
) {
  const event = envelope.event;
  const id = envelope.delegation_id;
  if (!runtime.current(attempt)) return;
  if (event.type === "response.created") {
    runtime.responses.set(event.response.id, { calls: [], handled: false });
    runtime.responseIds.set(id, event.response.id);
    return;
  }
  if (event.type === "response.output_item.done") {
    const item = event.item;
    const pending = runtime.responses.get(event.response_id ?? runtime.responseIds.get(id) ?? "");
    if (
      pending &&
      item.type === "function_call" &&
      item.call_id &&
      item.name &&
      item.arguments &&
      !pending.calls.some((call) => call.callId === item.call_id)
    )
      pending.calls.push({ callId: item.call_id, name: item.name, arguments: item.arguments });
    return;
  }
  const pending = runtime.responses.get(event.response.id);
  if (!pending || pending.handled) return;
  pending.handled = true;
  const turnId = await runtime.delegations.get(id);
  if (!runtime.current(attempt) || runtime.activeDelegation !== id || !runtime.sessionId) return;
  if (!turnId) {
    // 登録失敗でもfunction結果を返し、backendを未応答toolの待機に残さない。
    for (const call of pending.calls)
      runtime.channel?.send(
        JSON.stringify({
          type: "response.item.create",
          event_id: crypto.randomUUID(),
          item: {
            type: "function_call_output",
            call_id: call.callId,
            output: JSON.stringify({ error: "VOICE_TURN_UNAVAILABLE" }),
          },
        }),
      );
    runtime.responses.delete(event.response.id);
    if (pending.calls.length)
      runtime.channel?.send(
        JSON.stringify({ type: "response.create", event_id: crypto.randomUUID() }),
      );
    else runtime.reportFailure();
    return;
  }
  const sessionId = runtime.sessionId;
  const controller = new AbortController();
  runtime.delegation = controller;
  try {
    if (event.type !== "response.completed" || pending.calls.length === 0) {
      await parseResponse(
        runtime.client.voice.finish.$post({
          json: {
            voiceSessionId: sessionId,
            turnId,
            status: event.type === "response.completed" ? "completed" : "failed",
          },
        }),
      );
      if (event.type !== "response.completed") runtime.reportFailure();
      return;
    }
    runtime.emit({ status: "thinking" });
    // 同じresponseの独立した読取だけを並列実行し、書込はモデルの順序を保つ。
    const execute = async (call: PendingResponse["calls"][number]) => {
      if (!runtime.current(attempt) || runtime.activeDelegation !== id || controller.signal.aborted)
        return;
      let output: unknown;
      try {
        const argumentsValue: unknown = JSON.parse(call.arguments);
        const tool = z
          .object({ toolName: voiceToolNameSchema, arguments: z.record(z.string(), z.unknown()) })
          .parse({ toolName: call.name, arguments: argumentsValue });
        const result = await parseResponse(
          runtime.client.voice.tools.$post(
            {
              json: {
                voiceSessionId: sessionId,
                turnId,
                toolCallId: call.callId,
                ...tool,
              },
            },
            {
              init: { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) },
            },
          ),
        );
        output = result.result;
      } catch (error) {
        output = { error: apiError(error)?.code ?? "VOICE_TOOL_FAILED" };
      }
      if (runtime.current(attempt) && runtime.activeDelegation === id && !controller.signal.aborted)
        runtime.channel?.send(
          JSON.stringify({
            type: "response.item.create",
            event_id: crypto.randomUUID(),
            item: {
              type: "function_call_output",
              call_id: call.callId,
              output: JSON.stringify(output),
            },
          }),
        );
    };
    let reads: Promise<void>[] = [];
    for (const call of pending.calls) {
      if (call.name === "getCatalog" || call.name === "getTableState") reads.push(execute(call));
      else {
        await Promise.all(reads);
        reads = [];
        await execute(call);
      }
    }
    await Promise.all(reads);
    if (runtime.current(attempt) && runtime.activeDelegation === id && !controller.signal.aborted)
      runtime.channel?.send(
        JSON.stringify({ type: "response.create", event_id: crypto.randomUUID() }),
      );
  } catch {
    if (runtime.current(attempt) && !controller.signal.aborted) runtime.reportFailure();
  } finally {
    runtime.responses.delete(event.response.id);
    if (runtime.delegation === controller) runtime.delegation = undefined;
    runtime.onSync();
    runtime.scheduleProactive(attempt);
  }
}

export function reportFailure(runtime: VoiceRuntime) {
  runtime.channel?.send(
    JSON.stringify({
      type: "session.commentary.append",
      event_id: crypto.randomUUID(),
      delegation_id: null,
      content:
        runtime.locale === "ja"
          ? "今回の処理は完了できませんでした。注文の状態は画面で確認できます。"
          : "That request could not be completed. The order status is available on the screen.",
    }),
  );
  runtime.emit({ status: "listening" });
}
