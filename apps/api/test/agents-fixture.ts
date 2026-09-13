import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { vi } from "vitest";
import { z } from "zod";
import { voiceTurnSchema } from "../src/modules/voice/model";
import { startVoiceTurn } from "../src/modules/voice/turns";
import type { VoiceDiagnostics } from "../src/modules/voice/diagnostics";
import { createApiServices } from "../src/platform/context";

export const agentBindings = () => ({
  ...env,
  TABLECAST_MODEL_API_KEY: "tablecast-model-fixture",
  TABLECAST_MODEL: "gpt-5.6-luna",
});
export type AgentStep =
  | { text: string }
  | { tool: string; arguments: object; callId?: string }
  | { wait: Promise<void> }
  | { failure: true }
  | { providerToolFailure: true };
const submission = z.object({
  events: z.array(
    z.object({
      type: z.string(),
      call_id: z.string().optional(),
      output: z.string().optional(),
      success: z.boolean().optional(),
    }),
  ),
});

// 外部Agents APIだけを固定し、実SDKのSSE処理と実D1・業務toolを接続する。
export function mockAgentSessions(
  plans: AgentStep[][],
  options: { premature?: boolean; createGate?: Promise<void> } = {},
) {
  const requests: unknown[] = [];
  const toolResults: z.infer<typeof submission>["events"] = [];
  const cancellations: string[] = [];
  const sessions = new Map<
    string,
    {
      status: string;
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
            for (const [index, step] of steps.entries()) {
              if (session.status === "idle") return;
              if ("wait" in step) {
                await step.wait;
                continue;
              }
              if ("providerToolFailure" in step) {
                session.emit({
                  type: "agent.session.turn.item.done",
                  item: {
                    id: "tablecast-failed-provider-tool",
                    type: "function_call",
                    turn_id: turnId,
                    call_id: "tablecast-provider-call",
                    status: "failed",
                    name: "getCatalog",
                    arguments: { query: "tablecast-private-provider-error" },
                  },
                });
                continue;
              }
              if ("failure" in step) {
                session.emit({
                  type: "error",
                  error: { message: "tablecast-private-provider-error" },
                });
                return;
              }
              if ("text" in step) {
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
              } else {
                const ready = Promise.withResolvers<void>();
                resolver = ready.resolve;
                session.status = "requires_action";
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
              }
            }
            session.status = "idle";
            if (!options.premature) {
              session.emit({
                type: "agent.session.turn.completed",
                turn: { subagent_id: null },
                turn_id: turnId,
              });
              session.emit({
                type: "agent.session.idle",
                session: { id: sessionId, status: "idle" },
              });
            }
            session.close();
          })();
        },
        cancel() {
          listeners.clear();
        },
      });
      return new Response(body, { headers: { "content-type": "text/event-stream" } });
    }
    const matched = /^\/v1\/agents\/sessions\/([^/]+)(\/events)?$/.exec(url.pathname);
    if (!matched?.[1]) throw new Error(`予期しない外部API: ${url.pathname}`);
    const session = sessions.get(matched[1]);
    if (!session)
      return Response.json({ error: { message: "session not found" } }, { status: 404 });
    if (!matched[2]) return Response.json({ id: matched[1], status: session.status });
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
        session.emit({ type: "agent.session.turn.cancelled", turn: { subagent_id: null } });
        session.emit({ type: "agent.session.idle", session: { status: "idle" } });
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
