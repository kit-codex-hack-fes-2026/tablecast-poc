import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { vi } from "vitest";
import { z } from "zod";
import { voiceTurnSchema } from "../src/modules/voice/model";
import { startVoiceTurn } from "../src/modules/voice/turns";
import type { VoiceDiagnostics } from "../src/modules/voice/diagnostics";
import { createApiServices } from "../src/platform/context";
import { DomainError } from "../src/platform/errors";

export const agentBindings = () => ({
  ...env,
  TABLECAST_MODEL_API_KEY: "tablecast-model-fixture",
  TABLECAST_MODEL: "gpt-5.6-luna",
});
export type AgentStep =
  | { text: string; phase?: "commentary" | "final_answer" | null }
  | { tool: string; arguments: object; callId?: string; observed?: boolean }
  | { requestedTool: string; arguments: object }
  | { wait: Promise<void> }
  | { failure: true; error?: string }
  | { providerToolFailure: true; arguments?: object; tool?: string }
  | { turnFailure: true; error: string };
const submission = z.object({
  events: z.array(
    z.object({
      type: z.string(),
      call_id: z.string().optional(),
      output: z.string().optional(),
      error: z.string().optional(),
      success: z.boolean().optional(),
    }),
  ),
});

// 外部Agents APIだけを固定し、実SDKのSSE処理と実D1・業務toolを接続する。
export function mockAgentSessions(
  plans: AgentStep[][],
  options: {
    premature?: boolean;
    createGate?: Promise<void>;
    idleGate?: Promise<void>;
    omitIdle?: boolean;
  } = {},
) {
  const requests: unknown[] = [];
  const toolResults: z.infer<typeof submission>["events"] = [];
  const cancellations: string[] = [];
  const sessions = new Map<
    string,
    {
      status: string;
      turnId: string;
      turnStatus: string;
      emit: (event: object) => void;
      close: () => void;
      release: () => void;
      subscribe: (controller: ReadableStreamDefaultController<Uint8Array>) => void;
    }
  >();
  const encoder = new TextEncoder();
  let sequence = 0;
  const provider = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = init?.method ?? "GET";
    if (url.pathname === "/v1/agents/sessions" && method === "POST") {
      const request: unknown = JSON.parse(typeof init?.body === "string" ? init.body : "null");
      requests.push(request);
      const sessionId = `tablecast-agent-${requests.length}`;
      const turnId = `tablecast-managed-turn-${requests.length}`;
      const steps = plans[requests.length - 1] ?? [{ text: "はい。" }];
      const listeners = new Set<ReadableStreamDefaultController<Uint8Array>>();
      let resolver: (() => void) | undefined;
      const session = {
        status: "in_progress",
        turnId,
        turnStatus: "in_progress",
        emit(event: object) {
          const data = encoder.encode(
            `data: ${JSON.stringify({ event_id: `tablecast-event-${++sequence}`, session_id: sessionId, ...event })}\n\n`,
          );
          for (const listener of listeners) listener.enqueue(data);
        },
        close() {
          for (const listener of listeners) listener.close();
          listeners.clear();
        },
        release() {
          resolver?.();
          resolver = undefined;
        },
        subscribe(controller: ReadableStreamDefaultController<Uint8Array>) {
          listeners.add(controller);
        },
      };
      sessions.set(sessionId, session);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          session.subscribe(controller);
          init?.signal?.addEventListener(
            "abort",
            () => {
              if (listeners.has(controller)) {
                listeners.delete(controller);
                controller.error(new Error("tablecast-local-stream-aborted"));
              }
            },
            { once: true },
          );
          void (async () => {
            await options.createGate;
            if (!listeners.has(controller)) return;
            session.emit({ type: "agent.session.created", session: { id: sessionId } });
            session.emit({
              type: "agent.session.turn.created",
              turn_id: turnId,
              turn: { id: turnId, status: "in_progress", subagent_id: null },
            });
            for (const [index, step] of steps.entries()) {
              if (session.status === "idle") return;
              if ("wait" in step) {
                await step.wait;
                continue;
              }
              if ("providerToolFailure" in step || "requestedTool" in step) {
                const call = {
                  id: "tablecast-failed-provider-tool",
                  type: "function_call",
                  turn_id: turnId,
                  call_id: "tablecast-provider-call",
                  name: "requestedTool" in step ? step.requestedTool : (step.tool ?? "getCatalog"),
                };
                session.emit({
                  type: "agent.session.turn.item.added",
                  item: { ...call, status: "in_progress", arguments: {} },
                });
                session.emit({
                  type: "agent.session.turn.item.done",
                  item: {
                    ...call,
                    status: "providerToolFailure" in step ? "failed" : "in_progress",
                    arguments: step.arguments ?? { query: "お茶" },
                  },
                });
                continue;
              }
              if ("turnFailure" in step) {
                session.status = "failed";
                session.turnStatus = "failed";
                session.emit({
                  type: "agent.session.turn.failed",
                  turn_id: turnId,
                  turn: {
                    id: turnId,
                    status: "failed",
                    subagent_id: null,
                    error: { code: "internal_error", message: step.error },
                  },
                });
                session.close();
                return;
              }
              if ("failure" in step) {
                session.emit({
                  type: "error",
                  error: { message: step.error ?? "tablecast-private-provider-error" },
                });
                return;
              }
              if ("text" in step) {
                const message = {
                  id: `tablecast-message-${index}`,
                  type: "message",
                  role: "assistant",
                  turn_id: turnId,
                  phase: step.phase === undefined ? "final_answer" : step.phase,
                };
                session.emit({
                  type: "agent.session.turn.item.added",
                  item: { ...message, status: "in_progress", content: [] },
                });
                session.emit({
                  type: "agent.session.turn.output_text.delta",
                  item_id: `tablecast-message-${index}`,
                  content_index: 0,
                  delta: step.text,
                });
                session.emit({
                  type: "agent.session.turn.output_text.done",
                  item_id: `tablecast-message-${index}`,
                  content_index: 0,
                  text: step.text,
                });
                session.emit({
                  type: "agent.session.turn.item.done",
                  item: {
                    ...message,
                    status: "completed",
                    content: [{ type: "output_text", text: step.text, annotations: [] }],
                  },
                });
              } else {
                const call = {
                  id: `tablecast-observed-${index}`,
                  type: "function_call",
                  turn_id: turnId,
                  call_id: step.callId ?? `tablecast-call-${index}`,
                  name: step.tool,
                  arguments: step.arguments,
                };
                if (step.observed)
                  for (const type of [
                    "agent.session.turn.item.added",
                    "agent.session.turn.item.done",
                  ])
                    session.emit({ type, item: { ...call, status: "in_progress" } });
                const ready = Promise.withResolvers<void>();
                resolver = ready.resolve;
                session.status = "requires_action";
                session.turnStatus = "waiting";
                session.emit({
                  type: "agent.session.requires_action",
                  session: {
                    id: sessionId,
                    required_actions: [
                      {
                        type: "function_call",
                        turn_id: turnId,
                        call_id: step.callId ?? `tablecast-call-${index}`,
                        name: step.tool,
                        arguments: step.arguments,
                      },
                    ],
                  },
                });
                await ready.promise;
                if (session.status === "idle") return;
                session.status = "in_progress";
                session.turnStatus = "in_progress";
                if (step.observed)
                  session.emit({
                    type: "agent.session.turn.item.done",
                    item: { ...call, status: "completed" },
                  });
              }
            }
            session.turnStatus = "completed";
            if (!options.premature) {
              session.emit({
                type: "agent.session.turn.completed",
                turn: { id: turnId, status: "completed", subagent_id: null },
                turn_id: turnId,
              });
              await options.idleGate;
              session.status = "idle";
              if (!options.omitIdle)
                session.emit({
                  type: "agent.session.idle",
                  session: { id: sessionId, status: "idle", required_actions: [] },
                });
            }
            session.status = "idle";
            session.close();
          })();
        },
        cancel() {
          listeners.clear();
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    }
    const matched = /^\/v1\/agents\/sessions\/([^/]+)(\/(?:events|turns))?$/.exec(url.pathname);
    if (!matched?.[1]) throw new Error(`予期しない外部API: ${url.pathname}`);
    const session = sessions.get(matched[1]);
    if (!session)
      return Response.json({ error: { message: "session not found" } }, { status: 404 });
    if (!matched[2])
      return Response.json({ id: matched[1], status: session.status, required_actions: [] });
    if (matched[2] === "/turns")
      return Response.json({
        object: "list",
        data: [{ id: session.turnId, status: session.turnStatus, subagent_id: null }],
        has_more: false,
      });
    if (method === "GET")
      return new Response(
        new ReadableStream({
          start(controller) {
            session.subscribe(controller);
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    const body = submission.parse(JSON.parse(typeof init?.body === "string" ? init.body : "null"));
    for (const event of body.events) {
      if (event.type === "agent.session.input.cancel") {
        cancellations.push(matched[1]);
        session.status = "idle";
        session.turnStatus = "cancelled";
        session.emit({
          type: "agent.session.turn.cancelled",
          turn_id: session.turnId,
          turn: { id: session.turnId, status: "cancelled", subagent_id: null },
        });
        session.emit({
          type: "agent.session.idle",
          session: { id: matched[1], status: "idle", required_actions: [] },
        });
        session.release();
        session.close();
      } else {
        toolResults.push(event);
        session.release();
      }
    }
    return new Response(null, { status: 204 });
  });
  return { provider, requests, toolResults, cancellations };
}

export async function runVoiceTurn(
  input: unknown,
  configured = agentBindings(),
  signal = new AbortController().signal,
) {
  const context = createExecutionContext();
  const diagnostics: VoiceDiagnostics = {
    traceId: crypto.randomUUID(),
    releaseSha: configured.TABLECAST_RELEASE_SHA,
  };
  const result = await startVoiceTurn(
    createApiServices(configured),
    voiceTurnSchema.parse(input),
    diagnostics,
    signal,
    (promise) => context.waitUntil(promise),
  );
  return { result, diagnostics, finish: () => waitOnExecutionContext(context) };
}

export async function voiceTurnText(result: Awaited<ReturnType<typeof runVoiceTurn>>["result"]) {
  if (result.kind !== "stream") throw new Error("応答streamがない");
  const reader = result.stream.getReader();
  let text = "";
  let completed = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const data: unknown = JSON.parse(value.data);
      if (value.event === "delta") text += z.object({ delta: z.string() }).parse(data).delta;
      else if (value.event === "completed") completed = true;
      else if (value.event === "failed") {
        const { code } = z
          .object({ code: z.enum(["VOICE_MODEL_FAILED", "VOICE_CANCELLED"]) })
          .parse(data);
        throw new DomainError(code, 503, code);
      } else throw new Error("未対応の音声委任イベント");
    }
    if (!completed) throw new Error("音声委任の完了通知がない");
    return text;
  } finally {
    reader.releaseLock();
  }
}
