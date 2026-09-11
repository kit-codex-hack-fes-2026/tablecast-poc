import { failureLog } from "../../platform/telemetry";
import { RequestContext } from "@mastra/core/request-context";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { DomainError, ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { notifyStore } from "../tables/mutations";
import { getSession } from "../tables/queries";
import { createCastAgent } from "./agent";
import type { VoiceDiagnostics } from "./diagnostics";
import { logVoiceTurn, voiceErrorCode } from "./diagnostics";
import type { voiceTurnSchema } from "./model";
import { id, voiceToolNameSchema } from "./model";
import { currentVoiceTurn, proactiveReservationCondition, voiceActor } from "./queries";
import { recordVoiceEvent } from "./service";
export async function finishVoiceTurn(
  services: ApiServices,
  voiceSessionId: string,
  turnId: string,
  status: "completed" | "interrupted" | "failed",
  failureCode: "VOICE_MODEL_FAILED" | "VOICE_INTERNAL_ERROR" = "VOICE_INTERNAL_ERROR",
) {
  const db = services.db;

  const result = await db.batch([
    db
      .update(business.voiceTurns)
      .set({ status: status, ended_at: Date.now() })
      .where(
        sql`id=${turnId} AND voice_session_id=${voiceSessionId} AND (status='started' OR (status='completed' AND ${status}<>'completed'))`,
      ),
    db
      .insert(business.tableEvents)
      .select(
        sql`SELECT NULL,store_id,id,'voice.failed',${JSON.stringify({ turnId, code: failureCode })},${Date.now()} FROM table_sessions WHERE voice_session_id=${voiceSessionId} AND active_turn_id=${turnId} AND voice_state='active' AND status='open' AND ${status}='failed' AND changes()=1`,
      ),
    db
      .update(business.confirmations)
      .set({ status: "invalid" })
      .where(
        sql`voice_session_id=${voiceSessionId} AND created_turn_id=${turnId} AND status='pending' AND ${status}<>'completed'`,
      ),
    db
      .update(business.tableSessions)
      .set({ active_turn_id: null })
      .where(
        sql`voice_session_id=${voiceSessionId} AND active_turn_id=${turnId} AND ${status}<>'completed'`,
      ),
  ]);
  if (result[1]?.meta.changes === 1) {
    const source = await db.get<{ store_id: string; table_session_id: string } | undefined>(
      sql`SELECT store_id,table_session_id FROM voice_turns WHERE id=${turnId} AND voice_session_id=${voiceSessionId}`,
    );
    if (source) await notifyStore(services, source.store_id, source.table_session_id);
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
  if (proactive) ensure(!input.speaker, "PROACTIVE_SPEAKER_FORBIDDEN", 422);
  else ensure(input.messages.at(-1)?.role === "user", "USER_TURN_REQUIRED", 422);
  const startedAt = Date.now();
  // 任意の接客は業務状態が許可するときだけモデル資格を必要とする。
  if (proactive) {
    const eligible = (
      await db.get<{ id: string | number } | undefined>(
        sql`SELECT id FROM table_sessions WHERE id=${session.id} ${proactiveReservationCondition(startedAt, startedAt - 180_000)}`,
      )
    )?.id;
    if (!eligible) {
      logVoiceTurn(diagnostics, "skipped");
      return { kind: "skipped" } as const;
    }
  }
  ensure(
    services.env.TABLECAST_MODEL_API_KEY &&
      (input.transport === "realtime" || services.env.TABLECAST_MODEL),
    "VOICE_NOT_CONFIGURED",
    503,
  );
  const result = await db.batch([
    db
      .update(business.tableSessions)
      .set({ active_turn_id: input.turnId })
      .where(
        sql`id=${session.id} AND voice_state='active' AND voice_session_id=${input.voiceSessionId} AND status='open' AND locale=${input.locale} ${proactive ? sql`${proactiveReservationCondition(startedAt, startedAt - 180_000)}` : sql``}`,
      ),
    db
      .insert(business.voiceTurns)
      .select(
        sql`SELECT ${input.turnId},${input.voiceSessionId},id,store_id,locale,'started',${startedAt},NULL FROM table_sessions WHERE id=${session.id} AND active_turn_id=${input.turnId} AND voice_state='active' AND voice_session_id=${input.voiceSessionId} AND changes()=1`,
      ),
    db.insert(business.tableEvents).select(
      sql`SELECT NULL,store_id,id,${proactive ? "voice.proactive" : "voice.user"},${JSON.stringify(
        proactive
          ? { turnId: input.turnId, trigger: "proactive", locale: input.locale }
          : {
              turnId: input.turnId,
              role: "user",
              locale: input.locale,
              text: input.messages.at(-1)?.content,
              speaker: input.speaker ?? null,
            },
      )},${startedAt} FROM table_sessions WHERE id=${session.id} AND active_turn_id=${input.turnId} AND changes()=1`,
    ),
    db
      .update(business.voiceTurns)
      .set({ status: "interrupted", ended_at: startedAt })
      .where(
        sql`table_session_id=${session.id} AND id<>${input.turnId} AND status='started' AND changes()=1`,
      ),
    ...(!proactive
      ? [
          db
            .update(business.confirmations)
            .set({ status: "invalid" })
            .where(
              sql`table_session_id=${session.id} AND channel='voice' AND status='pending' AND EXISTS(SELECT 1 FROM table_sessions WHERE id=${session.id} AND active_turn_id=${input.turnId})`,
            ),
        ]
      : []),
  ]);
  if (proactive && result[0]?.meta.changes !== 1) {
    logVoiceTurn(diagnostics, "skipped");
    return { kind: "skipped" } as const;
  }
  ensure(result[0]?.meta.changes === 1, "VOICE_SESSION_STALE", 409);
  logVoiceTurn(diagnostics, "accepted");
  const currentActor = { ...actor, turnId: input.turnId };
  if (input.transport === "realtime") {
    waitUntil(notifyStore(services, actor.storeId, actor.tableSessionId));
    return { kind: "realtime" } as const;
  }
  const cancellation = new AbortController();
  const signal = AbortSignal.any([requestSignal, cancellation.signal]);
  let generationFailed = false;
  let generationError: unknown;
  const { agent, observability } = createCastAgent(
    services,
    currentActor,
    input.locale,
    signal,
    input.trigger,
  );
  let flushing: Promise<void> | undefined;
  const flush = () => {
    flushing ??= observability.shutdown().catch(() => {
      console.warn("tablecast.mastra_export_failed");
    });
    waitUntil(flushing);
  };
  const requestContext = new RequestContext<{ actor: Actor; diagnostics: VoiceDiagnostics }>();
  requestContext.set("actor", currentActor);
  requestContext.set("diagnostics", diagnostics);
  const output = await agent
    .stream(input.messages, {
      abortSignal: signal,
      requestContext,
      maxSteps: proactive ? 3 : 8,
      providerOptions: { openai: { reasoningEffort: "none" } },
      onChunk: async (chunk) => {
        if (
          chunk.type !== "tool-call" &&
          chunk.type !== "tool-result" &&
          chunk.type !== "tool-error"
        )
          return;
        signal.throwIfAborted();
        const toolName = voiceToolNameSchema.parse(chunk.payload.toolName);
        const toolCallId = id.parse(chunk.payload.toolCallId);
        // 言語変更は自身の資格を停止し、完了イベントを更新と同時に保存する。
        if (toolName === "setLanguage" && chunk.type === "tool-result") {
          const changed = (
            await db.get<{ id: string | number } | undefined>(
              sql`SELECT id FROM table_sessions WHERE id=${currentActor.tableSessionId} AND store_id=${currentActor.storeId} AND voice_state='stopped' AND voice_session_id IS NULL`,
            )
          )?.id;
          if (changed) return;
        }
        const stored = await recordVoiceEvent(services, currentActor, {
          kind: "voice.tool",
          data: {
            toolName,
            toolCallId,
            state:
              chunk.type === "tool-call"
                ? "running"
                : chunk.type === "tool-result"
                  ? "completed"
                  : "error",
            ...(chunk.type === "tool-error" ? { errorCode: "VOICE_TOOL_FAILED" } : {}),
          },
        });
        ensure(stored, "VOICE_SESSION_STALE", 409);
      },
      onError: ({ error }) => {
        generationFailed = true;
        generationError = error;
      },
      stopWhen: ({ steps }: { steps: readonly { toolCalls: readonly { toolName: string }[] }[] }) =>
        steps.some((step) =>
          step.toolCalls.some((call) =>
            ["prepareConfirmation", "setLanguage"].includes(call.toolName),
          ),
        ),
    })
    .catch(async (error: unknown) => {
      flush();
      await finishVoiceTurn(
        services,
        input.voiceSessionId,
        input.turnId,
        signal.aborted ? "interrupted" : "failed",
        "VOICE_MODEL_FAILED",
      );
      if (signal.aborted) throw new DomainError("VOICE_CANCELLED", 409, "VOICE_CANCELLED");
      throw new DomainError("VOICE_MODEL_FAILED", 503, "VOICE_MODEL_FAILED", undefined, {
        cause: error,
      });
    });
  diagnostics.runId = output.runId;
  waitUntil(notifyStore(services, actor.storeId, actor.tableSessionId));
  const reader = output.textStream.getReader();
  const encoder = new TextEncoder();
  let streamFinished = false;
  const logStreamEnd = (phase: "generated" | "interrupted" | "failed", code?: string) => {
    if (streamFinished) return;
    streamFinished = true;
    logVoiceTurn(diagnostics, phase, code);
  };
  const response = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal.throwIfAborted();
        const next = await reader.read();
        signal.throwIfAborted();
        if (generationFailed)
          throw new DomainError("VOICE_MODEL_FAILED", 503, "VOICE_MODEL_FAILED", undefined, {
            cause: generationError,
          });
        await currentVoiceTurn(services, currentActor, input.locale, input.trigger);
        if (next.done) {
          logStreamEnd("generated");
          controller.close();
          reader.releaseLock();
          flush();
          return;
        }
        controller.enqueue(encoder.encode(next.value));
      } catch (error) {
        const status =
          signal.aborted || (error instanceof DomainError && error.status === 409)
            ? "interrupted"
            : "failed";
        logStreamEnd(status, signal.aborted ? "VOICE_CANCELLED" : voiceErrorCode(error));
        if (status === "failed")
          failureLog(
            "tablecast.voice.stream_failed",
            new DomainError("VOICE_INTERNAL_ERROR", 503, voiceErrorCode(error), undefined, {
              cause: error,
            }),
            services.env,
            { "tablecast.request.id": diagnostics.traceId },
          );
        cancellation.abort();
        controller.error(error);
        await reader.cancel().catch((cancelError: unknown) => {
          failureLog(
            "tablecast.voice.cancel_failed",
            new DomainError("VOICE_INTERNAL_ERROR", 503, "VOICE_CANCEL_FAILED", undefined, {
              cause: cancelError,
            }),
            services.env,
            { "tablecast.request.id": diagnostics.traceId },
          );
        });
        try {
          await finishVoiceTurn(
            services,
            input.voiceSessionId,
            input.turnId,
            status,
            "VOICE_MODEL_FAILED",
          );
        } finally {
          flush();
        }
      }
    },
    async cancel(reason) {
      logStreamEnd("interrupted", "VOICE_CANCELLED");
      cancellation.abort();
      try {
        await reader.cancel(reason);
      } finally {
        try {
          await finishVoiceTurn(services, input.voiceSessionId, input.turnId, "interrupted");
        } finally {
          flush();
        }
      }
    },
  });
  return { kind: "stream", stream: response } as const;
}
