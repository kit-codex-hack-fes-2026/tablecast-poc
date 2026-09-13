import { SpanStatusCode } from "@opentelemetry/api";
import { and, eq, exists, isNull, ne, notExists, sql } from "drizzle-orm";
import OpenAI from "openai";
import type { Stream } from "openai/core/streaming";
import type { AgentSessionEvent } from "openai/resources/beta/agents/agents";
import type { z } from "zod";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { DomainError, ensure } from "../../platform/errors";
import { failureLog, telemetryContent } from "../../platform/telemetry";
import { notifyStore, voiceTurnEvent } from "../tables/mutations";
import { getSession } from "../tables/queries";
import { castSessionInstructions, createCastTools } from "./agent";
import type { VoiceDiagnostics } from "./diagnostics";
import { logVoiceTurn } from "./diagnostics";
import type { voiceTurnSchema } from "./model";
import { toolSchema, voiceToolEventSchema } from "./model";
import { voiceGenerationSpan } from "./observability";
import { currentVoiceTurn, proactiveReservationCondition, voiceActor } from "./queries";
import { conversationHistory, invokeVoiceTool } from "./realtime";
import { cancelAgentSession } from "./runtime";
import { recordVoiceEvent, voiceToolQuery } from "./service";

export async function finishVoiceTurn(
  services: ApiServices,
  voiceSessionId: string,
  turnId: string,
  status: "completed" | "interrupted" | "failed",
  failureCode: "VOICE_MODEL_FAILED" | "VOICE_INTERNAL_ERROR" = "VOICE_INTERNAL_ERROR",
) {
  const db = services.db;
  const now = Date.now();
  const result = await db.batch([
    db
      .update(business.voiceTurns)
      .set({ status, ended_at: now })
      .where(
        and(
          eq(business.voiceTurns.id, turnId),
          eq(business.voiceTurns.voice_session_id, voiceSessionId),
          sql`(${business.voiceTurns.status}='started' OR (${business.voiceTurns.status}='completed' AND ${status}<>'completed'))`,
        ),
      ),
    db.insert(business.tableEvents).select(
      db
        .select({
          cursor: sql<number>`NULL`.as("cursor"),
          store_id: business.tableSessions.store_id,
          table_session_id: business.tableSessions.id,
          kind: sql<string>`'voice.failed'`.as("kind"),
          data_json: sql<string>`${JSON.stringify({ turnId, code: failureCode })}`.as("data_json"),
          created_at: sql<number>`${now}`.as("created_at"),
        })
        .from(business.tableSessions)
        .where(
          and(
            eq(business.tableSessions.voice_session_id, voiceSessionId),
            eq(business.tableSessions.active_turn_id, turnId),
            eq(business.tableSessions.voice_state, "active"),
            eq(business.tableSessions.status, "open"),
            sql`${status}='failed' AND changes()=1`,
          ),
        ),
    ),
    db
      .update(business.confirmations)
      .set({ status: "invalid" })
      .where(
        and(
          eq(business.confirmations.voice_session_id, voiceSessionId),
          eq(business.confirmations.created_turn_id, turnId),
          eq(business.confirmations.status, "pending"),
          sql`${status}<>'completed'`,
        ),
      ),
    db
      .update(business.tableSessions)
      .set({ active_turn_id: null })
      .where(
        and(
          eq(business.tableSessions.voice_session_id, voiceSessionId),
          eq(business.tableSessions.active_turn_id, turnId),
          sql`${status}<>'completed'`,
        ),
      ),
    voiceTurnEvent(
      services,
      and(
        eq(business.voiceTurns.id, turnId),
        eq(business.voiceTurns.voice_session_id, voiceSessionId),
        ne(business.voiceTurns.status, "started"),
      ),
    ),
  ]);
  if (result[1]?.meta.changes === 1 || result[4]?.meta.changes === 1) {
    const source = await db
      .select({
        storeId: business.voiceTurns.store_id,
        tableSessionId: business.voiceTurns.table_session_id,
      })
      .from(business.voiceTurns)
      .where(
        and(
          eq(business.voiceTurns.id, turnId),
          eq(business.voiceTurns.voice_session_id, voiceSessionId),
        ),
      )
      .get();
    if (source) await notifyStore(services, source.storeId, source.tableSessionId);
  }
}

export async function startVoiceTurn(
  services: ApiServices,
  input: z.infer<typeof voiceTurnSchema>,
  diagnostics: VoiceDiagnostics,
  requestSignal: AbortSignal,
  waitUntil: (promise: Promise<unknown>) => void,
) {
  const db = services.db;
  const actor = await voiceActor(services, input.voiceSessionId);
  Object.assign(diagnostics, {
    storeId: actor.storeId,
    tableSessionId: actor.tableSessionId,
    voiceSessionId: actor.voiceSessionId,
    turnId: input.turnId,
  });
  const session = await getSession(services, actor);
  ensure(input.locale === session.locale, "VOICE_LOCALE_STALE", 409);
  const proactive = input.trigger === "proactive";
  if (!proactive) ensure(input.messages.at(-1)?.role === "user", "USER_TURN_REQUIRED", 422);
  const startedAt = Date.now();
  const active = and(
    eq(business.tableSessions.id, session.id),
    eq(business.tableSessions.voice_state, "active"),
    eq(business.tableSessions.voice_session_id, input.voiceSessionId),
    eq(business.tableSessions.status, "open"),
    eq(business.tableSessions.locale, input.locale),
  );
  const eligibility = proactive
    ? sql`1=1 ${proactiveReservationCondition(startedAt, startedAt - 180_000)}`
    : undefined;
  if (
    proactive &&
    !(await db
      .select({ id: business.tableSessions.id })
      .from(business.tableSessions)
      .where(and(active, eligibility))
      .get())
  ) {
    logVoiceTurn(diagnostics, "skipped");
    return { kind: "skipped" } as const;
  }
  ensure(
    services.env.TABLECAST_MODEL_API_KEY && services.env.TABLECAST_MODEL,
    "VOICE_NOT_CONFIGURED",
    503,
  );
  const conversationEvent = { turnId: input.turnId, trigger: "proactive", locale: input.locale };
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({ active_turn_id: input.turnId })
      .where(
        and(
          active,
          eligibility,
          notExists(
            db
              .select({ id: business.voiceTurns.id })
              .from(business.voiceTurns)
              .where(eq(business.voiceTurns.id, input.turnId)),
          ),
        ),
      ),
    db.insert(business.voiceTurns).select(
      db
        .select({
          id: sql<string>`${input.turnId}`.as("id"),
          voice_session_id: sql<string>`${input.voiceSessionId}`.as("voice_session_id"),
          table_session_id: business.tableSessions.id,
          store_id: business.tableSessions.store_id,
          locale: business.tableSessions.locale,
          status: sql<"started">`'started'`.as("status"),
          started_at: sql<number>`${startedAt}`.as("started_at"),
          ended_at: sql<number | null>`NULL`.as("ended_at"),
          agent_session_id: sql<string | null>`NULL`.as("agent_session_id"),
          agent_finished_at: sql<number | null>`NULL`.as("agent_finished_at"),
        })
        .from(business.tableSessions)
        .where(
          and(active, eq(business.tableSessions.active_turn_id, input.turnId), sql`changes()=1`),
        ),
    ),
    db.insert(business.tableEvents).select(
      db
        .select({
          cursor: sql<number>`NULL`.as("cursor"),
          store_id: business.tableSessions.store_id,
          table_session_id: business.tableSessions.id,
          kind: sql<string>`'voice.proactive'`.as("kind"),
          data_json: sql<string>`${JSON.stringify(conversationEvent)}`.as("data_json"),
          created_at: sql<number>`${startedAt}`.as("created_at"),
        })
        .from(business.tableSessions)
        .where(
          and(
            active,
            eq(business.tableSessions.active_turn_id, input.turnId),
            sql`changes()=1 AND ${proactive}`,
          ),
        ),
    ),
    db
      .update(business.voiceTurns)
      .set({ status: "interrupted", ended_at: startedAt })
      .where(
        and(
          eq(business.voiceTurns.table_session_id, session.id),
          ne(business.voiceTurns.id, input.turnId),
          eq(business.voiceTurns.status, "started"),
          exists(
            db
              .select({ id: business.tableSessions.id })
              .from(business.tableSessions)
              .where(and(active, eq(business.tableSessions.active_turn_id, input.turnId))),
          ),
        ),
      ),
    voiceTurnEvent(
      services,
      and(
        eq(business.voiceTurns.id, input.turnId),
        eq(business.voiceTurns.voice_session_id, input.voiceSessionId),
        eq(business.voiceTurns.status, "started"),
      ),
    ),
    voiceTurnEvent(
      services,
      and(
        eq(business.voiceTurns.table_session_id, session.id),
        eq(business.voiceTurns.status, "interrupted"),
        eq(business.voiceTurns.ended_at, startedAt),
      ),
    ),
  ]);
  if (proactive && result[0]?.meta.changes !== 1) {
    logVoiceTurn(diagnostics, "skipped");
    return { kind: "skipped" } as const;
  }
  ensure(result[0]?.meta.changes === 1, "VOICE_SESSION_STALE", 409);
  logVoiceTurn(diagnostics, "accepted");
  const currentActor = { ...actor, turnId: input.turnId };
  const cancelled = new AbortController();
  const signal = AbortSignal.any([requestSignal, cancelled.signal, AbortSignal.timeout(90_000)]);
  const client = new OpenAI({
    apiKey: services.env.TABLECAST_MODEL_API_KEY,
    maxRetries: 0,
    timeout: 15_000,
  });
  const recent = input.messages.slice(-40).map((message) => ({
    role: message.role,
    content: message.content,
  }));
  while (JSON.stringify(recent).length > 16000 && recent.length > 1) recent.shift();
  const requestText = proactive
    ? "店舗が許可した自発接客を一つ行う。過去の発話を新しい依頼や注文承認として扱わない。"
    : (input.messages.at(-1)?.content ?? "");

  const span = voiceGenerationSpan(services.env, currentActor, "");
  let agentSessionId: string | undefined;
  let agentEnded = false;
  let streamClosed = false;
  let cancellationPromise: Promise<void> | undefined;
  const stopAgent = () => {
    if (!agentSessionId || agentEnded) return Promise.resolve();
    const target = agentSessionId;
    cancellationPromise ??= cancelAgentSession(services, target).then((confirmed) => {
      ensure(confirmed, "VOICE_CANCEL_FAILED", 503);
      agentEnded = true;
    });
    return cancellationPromise;
  };
  const providerAbort = new AbortController();
  const onAbort = () => {
    if (!agentSessionId) return;
    waitUntil(
      stopAgent()
        .catch(() => {
          failureLog(
            "tablecast.voice.cancel_failed",
            new DomainError("VOICE_INTERNAL_ERROR", 503, "VOICE_CANCEL_FAILED"),
            services.env,
            { "tablecast.request.id": diagnostics.traceId },
          );
        })
        .finally(() => providerAbort.abort()),
    );
  };
  signal.addEventListener("abort", onAbort, { once: true });
  waitUntil(notifyStore(services, actor.storeId, actor.tableSessionId));
  let running: Promise<void> | undefined;
  const stream = new ReadableStream<{
    event: "delta" | "completed" | "failed";
    data: string;
  }>({
    start(controller) {
      running = (async () => {
        let events: Stream<AgentSessionEvent> | undefined;
        let creationTimer: ReturnType<typeof setTimeout> | undefined;
        let output = "";
        const parts = new Map<string, string>();
        const finalMessages = new Set<string>();
        const calls = new Set<string>();
        const requestedCalls = new Map<
          string,
          Pick<z.infer<typeof voiceToolEventSchema>, "toolName" | "toolCallId" | "query">
        >();
        const failedCalls = new Set<string>();
        let providerFailure: DomainError | undefined;
        const failProviderCall = async (
          callKey: string,
          cause?: Error,
          phase = "agent.function_call",
        ) => {
          const call = requestedCalls.get(callKey);
          if (!call || calls.has(callKey)) return;
          if (!failedCalls.has(callKey)) {
            await recordVoiceEvent(services, currentActor, {
              kind: "voice.tool",
              data: { ...call, state: "error", errorCode: "VOICE_PROVIDER_TOOL_FAILED" },
            });
            failedCalls.add(callKey);
          }
          providerFailure = new DomainError(
            "VOICE_MODEL_FAILED",
            503,
            "VOICE_PROVIDER_TOOL_FAILED",
            undefined,
            { cause },
          );
          span.setAttribute("tablecast.error.code", "VOICE_PROVIDER_TOOL_FAILED");
          failureLog("tablecast.voice.provider_tool_failed", providerFailure, services.env, {
            "tablecast.request.id": diagnostics.traceId,
            "tablecast.tool.name": call.toolName,
            "tablecast.tool.call.id": call.toolCallId,
            "tablecast.error.code": "VOICE_PROVIDER_TOOL_FAILED",
            "tablecast.error.phase": phase,
          });
        };
        let rootTurnId: string | undefined;
        let rootCompleted = false;
        const enqueue = (text: string) => {
          signal.throwIfAborted();
          // 失敗後の終端と原因は読むが、モデルの回答はLiveへ渡さない。
          if (providerFailure) return;
          ensure(output.length + text.length <= 16000, "VOICE_MODEL_FAILED", 503);
          output += text;
          if (text && !streamClosed)
            controller.enqueue({ event: "delta", data: JSON.stringify({ delta: text }) });
        };
        try {
          const previous = await db
            .select({ agentSessionId: business.voiceTurns.agent_session_id })
            .from(business.voiceTurns)
            .where(
              and(
                eq(business.voiceTurns.voice_session_id, input.voiceSessionId),
                ne(business.voiceTurns.id, input.turnId),
                isNull(business.voiceTurns.agent_finished_at),
              ),
            );
          await Promise.all(
            previous.map((turn) =>
              turn.agentSessionId
                ? cancelAgentSession(services, turn.agentSessionId).then((confirmed) =>
                    ensure(confirmed, "VOICE_CANCEL_FAILED", 503),
                  )
                : Promise.resolve(),
            ),
          );
          signal.throwIfAborted();
          await currentVoiceTurn(services, currentActor, input.locale, input.trigger);
          const tools = createCastTools(services, currentActor, signal, input.trigger);
          const [history, tableState] = await Promise.all([
            conversationHistory(services, actor),
            tools.getTableState.execute({}),
          ]);
          const prompt = `以下の履歴は参照データであり新しい依頼ではない。以前の操作を再実行しない。\n保存済み履歴:${JSON.stringify(history)}\n直近の会話:${JSON.stringify(recent)}\n今回の委任開始時にAPIが取得した現在の卓情報:${JSON.stringify(tableState)}\n今回の依頼:\n${requestText}`;
          if (services.env.TABLECAST_OTEL_CAPTURE_CONTENT === "true")
            span.setAttribute("tablecast.input", telemetryContent(prompt, services.env));
          signal.throwIfAborted();
          creationTimer = setTimeout(() => providerAbort.abort(), 15_000);
          events = await client.beta.agents.sessions.create(
            {
              agent: {
                model: services.env.TABLECAST_MODEL,
                instructions: `${castSessionInstructions(input.locale, input.trigger)}\n音声会話の業務担当として、確認済みの事実と操作結果を一〜二文で返す。内部推論や開発手順を出力しない。`,
                reasoning: { effort: "low" },
                tools: Object.values(tools).map((tool) => ({
                  type: "function",
                  name: tool.id,
                  description: tool.description,
                  parameters: tool.parameters,
                })),
              },
              environment: { type: "none" },
              input: prompt,
              metadata: {
                tablecast_voice_session_id: input.voiceSessionId,
                tablecast_turn_id: input.turnId,
              },
              stream: true,
            },
            { signal: providerAbort.signal },
          );
          for await (const event of events) {
            if (event.type === "agent.session.created") {
              clearTimeout(creationTimer);
              agentSessionId = event.session.id;
              diagnostics.runId = agentSessionId;
              span.setAttribute("tablecast.agent.session.id", agentSessionId);
              await db
                .update(business.voiceTurns)
                .set({ agent_session_id: agentSessionId })
                .where(
                  and(
                    eq(business.voiceTurns.id, input.turnId),
                    eq(business.voiceTurns.voice_session_id, input.voiceSessionId),
                  ),
                );
              // 作成応答の前に停止・次の発話が来ても、作成されたsessionを必ず停止できるようIDを残す。
              if (signal.aborted) {
                await stopAgent();
                signal.throwIfAborted();
              }
              await currentVoiceTurn(services, currentActor, input.locale, input.trigger);
            }
            signal.throwIfAborted();
            if (event.type === "agent.session.turn.created" && event.turn.subagent_id === null) {
              rootTurnId ??= event.turn_id;
            } else if (
              (event.type === "agent.session.turn.item.added" ||
                event.type === "agent.session.turn.item.done") &&
              event.item.type === "message" &&
              event.item.role === "assistant" &&
              event.item.id !== null &&
              event.item.phase === "final_answer" &&
              !providerFailure
            ) {
              finalMessages.add(event.item.id);
              if (event.type === "agent.session.turn.item.done")
                for (const [index, content] of event.item.content.entries()) {
                  if (content.type !== "output_text") continue;
                  const key = `${event.item.id}:${index}`;
                  const previousText = parts.get(key) ?? "";
                  if (content.text.startsWith(previousText))
                    enqueue(content.text.slice(previousText.length));
                  parts.set(key, content.text);
                }
            } else if (event.type === "agent.session.turn.output_text.delta") {
              // 進捗のcommentaryやphase不明の本文を、確認済みの業務結果としてLiveへ渡さない。
              if (providerFailure || !finalMessages.has(event.item_id)) continue;
              const key = `${event.item_id}:${event.content_index}`;
              parts.set(key, (parts.get(key) ?? "") + event.delta);
              enqueue(event.delta);
            } else if (event.type === "agent.session.turn.output_text.done") {
              if (providerFailure || !finalMessages.has(event.item_id)) continue;
              const key = `${event.item_id}:${event.content_index}`;
              const previousText = parts.get(key) ?? "";
              if (event.text.startsWith(previousText))
                enqueue(event.text.slice(previousText.length));
              parts.set(key, event.text);
            } else if (
              (event.type === "agent.session.turn.item.added" ||
                event.type === "agent.session.turn.item.done") &&
              event.item.type === "function_call"
            ) {
              const callKey = `${event.item.turn_id}:${event.item.call_id}`;
              if (calls.has(callKey)) continue;
              const call = voiceToolEventSchema.safeParse({
                turnId: input.turnId,
                toolName: event.item.name,
                toolCallId: event.item.call_id,
                query: voiceToolQuery(event.item.name, event.item.arguments),
                state: "requested",
              });
              if (!call.success) {
                ensure(
                  event.item.status !== "failed" && event.item.status !== "incomplete",
                  "VOICE_MODEL_FAILED",
                  503,
                );
                continue;
              }
              if (
                !requestedCalls.has(callKey) ||
                (requestedCalls.get(callKey)?.query === undefined && call.data.query !== undefined)
              ) {
                const { toolName, toolCallId, query } = call.data;
                requestedCalls.set(callKey, { toolName, toolCallId, query });
                // 観測だけではrunningのcall IDを予約せず、業務を実行しない。
                await recordVoiceEvent(services, currentActor, {
                  kind: "voice.tool",
                  data: { toolName, toolCallId, query, state: "requested" },
                });
              }
              if (event.item.status === "failed" || event.item.status === "incomplete")
                await failProviderCall(callKey);
            } else if (event.type === "agent.session.requires_action") {
              if (providerFailure) throw providerFailure;
              ensure(agentSessionId === event.session.id, "VOICE_MODEL_FAILED", 503);
              for (const action of event.session.required_actions) {
                ensure(action.type === "function_call", "VOICE_MODEL_FAILED", 503);
                const callKey = `${action.turn_id}:${action.call_id}`;
                if (calls.has(callKey)) continue;
                ensure(calls.size < (proactive ? 3 : 8), "VOICE_MODEL_FAILED", 503);
                calls.add(callKey);
                let toolResponse:
                  | { success: true; output: string }
                  | { success: false; error: string };
                let invoked = false;
                try {
                  const toolInput = toolSchema.parse({
                    voiceSessionId: input.voiceSessionId,
                    turnId: input.turnId,
                    toolCallId: action.call_id,
                    toolName: action.name,
                    arguments: action.arguments,
                  });
                  invoked = true;
                  const toolResult = await invokeVoiceTool(services, toolInput, signal);
                  toolResponse = { success: true, output: JSON.stringify(toolResult.result) };
                } catch (error) {
                  if (
                    signal.aborted ||
                    (error instanceof DomainError && error.code === "VOICE_SESSION_STALE")
                  )
                    throw error;
                  const code = voiceToolEventSchema.shape.errorCode.safeParse(
                    error instanceof DomainError ? error.code : "VOICE_TOOL_FAILED",
                  );
                  toolResponse = {
                    success: false,
                    error: code.success && code.data ? code.data : "VOICE_TOOL_FAILED",
                  };
                  const call = requestedCalls.get(callKey);
                  if (!invoked && call)
                    await recordVoiceEvent(services, currentActor, {
                      kind: "voice.tool",
                      data: { ...call, state: "error", errorCode: toolResponse.error },
                    });
                }
                signal.throwIfAborted();
                await client.beta.agents.sessions.events.create(
                  agentSessionId,
                  {
                    events: [
                      {
                        type: "agent.session.input.tool_result",
                        turn_id: action.turn_id,
                        call_id: action.call_id,
                        ...toolResponse,
                      },
                    ],
                    "Idempotency-Key": `tablecast-${input.turnId}-${action.call_id}`,
                  },
                  { signal },
                );
                // 言語変更は音声資格を失効させるため、以後の出力や操作を続けない。
                await currentVoiceTurn(services, currentActor, input.locale, input.trigger);
              }
            } else if (
              (event.type === "agent.session.turn.completed" ||
                event.type === "agent.session.turn.cancelled" ||
                event.type === "agent.session.turn.failed") &&
              event.turn_id === rootTurnId &&
              rootTurnId !== undefined
            ) {
              if (event.type === "agent.session.turn.failed") {
                throw new DomainError("VOICE_MODEL_FAILED", 503, "VOICE_MODEL_FAILED", undefined, {
                  cause: event.turn.error
                    ? new Error(JSON.stringify(event.turn.error))
                    : providerFailure,
                });
              }
              ensure(
                event.type === "agent.session.turn.completed",
                event.type === "agent.session.turn.cancelled"
                  ? "VOICE_CANCELLED"
                  : "VOICE_MODEL_FAILED",
                503,
              );
              rootCompleted = true;
            } else if (
              event.type === "agent.session.idle" &&
              rootCompleted &&
              event.session.required_actions.length === 0
            ) {
              // 公式SDKと同じく、対象turnの終端とsessionの停止を別々に確認する。
              agentEnded = true;
              await db
                .update(business.voiceTurns)
                .set({ agent_finished_at: Date.now() })
                .where(
                  and(
                    eq(business.voiceTurns.id, input.turnId),
                    eq(business.voiceTurns.agent_session_id, agentSessionId ?? ""),
                  ),
                );
              for (const callKey of requestedCalls.keys())
                if (!calls.has(callKey) && !failedCalls.has(callKey))
                  await failProviderCall(callKey);
              if (providerFailure) throw providerFailure;
              await currentVoiceTurn(services, currentActor, input.locale, input.trigger);
              ensure(output.length > 0, "VOICE_MODEL_FAILED", 503);
              await finishVoiceTurn(services, input.voiceSessionId, input.turnId, "completed");
              logVoiceTurn(diagnostics, "generated");
              if (services.env.TABLECAST_OTEL_CAPTURE_CONTENT === "true")
                span.setAttribute("tablecast.output", telemetryContent(output, services.env));
              if (!streamClosed) {
                controller.enqueue({ event: "completed", data: "{}" });
                streamClosed = true;
                controller.close();
              }
              return;
            } else if (
              event.type === "error" ||
              event.type === "agent.session.failed" ||
              event.type === "agent.session.environment.failed"
            ) {
              const cause =
                event.type === "error"
                  ? event.error
                  : event.type === "agent.session.failed"
                    ? event.session.error
                    : event.environment.error;
              throw new DomainError("VOICE_MODEL_FAILED", 503, "VOICE_MODEL_FAILED", undefined, {
                cause: cause
                  ? new Error(typeof cause === "string" ? cause : JSON.stringify(cause))
                  : providerFailure,
              });
            }
          }
          throw providerFailure ?? new DomainError("VOICE_MODEL_FAILED", 503, "VOICE_MODEL_FAILED");
        } catch (error) {
          const interrupted =
            requestSignal.aborted ||
            cancelled.signal.aborted ||
            (error instanceof DomainError &&
              (error.status === 409 || error.code === "VOICE_CANCELLED"));
          const status = interrupted ? "interrupted" : "failed";
          const safeError = new DomainError(
            interrupted ? "VOICE_CANCELLED" : "VOICE_MODEL_FAILED",
            interrupted ? 409 : 503,
            interrupted ? "VOICE_CANCELLED" : "VOICE_MODEL_FAILED",
            undefined,
            { cause: error },
          );
          span.setStatus({ code: SpanStatusCode.ERROR });
          logVoiceTurn(diagnostics, status, safeError.code);
          if (!interrupted)
            failureLog("tablecast.voice.stream_failed", safeError, services.env, {
              "tablecast.request.id": diagnostics.traceId,
            });
          try {
            for (const [callKey, call] of requestedCalls) {
              if (calls.has(callKey)) continue;
              if (!interrupted)
                await failProviderCall(
                  callKey,
                  error instanceof Error ? error : undefined,
                  "agent.stream",
                );
              else if (!failedCalls.has(callKey))
                await recordVoiceEvent(services, currentActor, {
                  kind: "voice.tool",
                  data: { ...call, state: "error", errorCode: "VOICE_CANCELLED" },
                });
            }
            await finishVoiceTurn(
              services,
              input.voiceSessionId,
              input.turnId,
              status,
              "VOICE_MODEL_FAILED",
            );
            // 次の委任はfailed受信で開始できるため、先にDBへ旧turnの終端を保存する。
            if (!streamClosed) {
              controller.enqueue({
                event: "failed",
                data: JSON.stringify({ code: safeError.code }),
              });
              streamClosed = true;
              controller.close();
            }
          } catch (finishError) {
            failureLog(
              "tablecast.voice.finish_failed",
              new DomainError("VOICE_INTERNAL_ERROR", 503, "VOICE_INTERNAL_ERROR", undefined, {
                cause: finishError,
              }),
              services.env,
              { "tablecast.request.id": diagnostics.traceId },
            );
            if (!streamClosed) {
              streamClosed = true;
              // 保存失敗は復旧可能なfailed通知にせず、機密を含まないtransport failureで閉じる。
              controller.error(
                new DomainError("VOICE_INTERNAL_ERROR", 503, "VOICE_INTERNAL_ERROR"),
              );
            }
          } finally {
            await stopAgent().catch(() => {
              failureLog(
                "tablecast.voice.cancel_failed",
                new DomainError("VOICE_INTERNAL_ERROR", 503, "VOICE_CANCEL_FAILED"),
                services.env,
                { "tablecast.request.id": diagnostics.traceId },
              );
            });
          }
        } finally {
          clearTimeout(creationTimer);
          events?.controller.abort();
          signal.removeEventListener("abort", onAbort);
          span.end();
        }
      })();
      waitUntil(running);
    },
    async cancel() {
      streamClosed = true;
      cancelled.abort();
      await running;
    },
  });
  return { kind: "stream", stream } as const;
}
