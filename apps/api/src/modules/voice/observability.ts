import type { z } from "zod";
import { and, eq, exists } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { voiceObservationsSchema } from "./model";
import * as business from "../../db/business-schema";
import { ensure } from "../../platform/errors";
import { llmSessionId, recordLlmObservation } from "../../platform/telemetry-llm";
import { validateSession } from "../tables/queries";

export async function voiceObservationContext(
  services: ApiServices,
  actor: Actor,
  voiceSessionId: string,
) {
  const db = services.db;
  const row = await db
    .select({
      session: business.tableSessions,
      personal: exists(
        db
          .select({ id: business.customerContexts.sessionId })
          .from(business.customerContexts)
          .where(
            and(
              eq(business.customerContexts.sessionId, business.tableSessions.id),
              eq(business.customerContexts.storeId, actor.storeId),
            ),
          ),
      ).mapWith(Boolean),
    })
    .from(business.tableSessions)
    .where(
      and(
        eq(business.tableSessions.id, actor.tableSessionId ?? ""),
        eq(business.tableSessions.store_id, actor.storeId),
        eq(business.tableSessions.voice_session_id, voiceSessionId),
        eq(business.tableSessions.voice_state, "active"),
        eq(business.tableSessions.status, "open"),
      ),
    )
    .get();
  ensure(row, "VOICE_SESSION_STALE", 409);
  await validateSession(services, actor, row.session);
  return row;
}

export async function recordVoiceObservations(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof voiceObservationsSchema>,
) {
  const row = await voiceObservationContext(services, actor, input.voiceSessionId);
  if (row.personal || services.env.TABLECAST_ENV === "production") return { ok: true };
  const now = Date.now();
  for (const event of input.events) {
    // 古い時刻や未来の値を長時間spanとして書き込ませない。
    ensure(
      event.endedAt >= event.startedAt &&
        event.endedAt <= now + 60_000 &&
        event.startedAt >= now - 86_400_000,
      "INVALID_INPUT",
      422,
    );
  }
  for (const event of input.events) {
    recordLlmObservation(
      services.env,
      `tablecast.voice.${event.kind}`,
      {
        "tablecast.observation.type": event.kind === "response" ? "generation" : "event",
        "tablecast.observation.source": "browser",
        "tablecast.observation.content_truncated": event.contentTruncated ?? false,
        "tablecast.observation.dropped_events": event.droppedEvents ?? 0,
        "tablecast.outcome":
          event.status === "failed" || event.status === "incomplete" ? "error" : "success",
        "tablecast.session.id": llmSessionId(services.env, row.session.id),
        "tablecast.voice.session.id": input.voiceSessionId,
        "tablecast.event.id": event.eventId,
        ...(event.turnId ? { "tablecast.voice.turn.id": event.turnId } : {}),
        ...(event.delegationId ? { "tablecast.delegation.id": event.delegationId } : {}),
        ...(event.responseId ? { "tablecast.response.id": event.responseId } : {}),
        ...(event.toolCallIds?.length
          ? { "tablecast.tool.call.ids": JSON.stringify(event.toolCallIds) }
          : {}),
        ...(event.model ? { "gen_ai.response.model": event.model } : {}),
        ...(event.usage
          ? {
              "gen_ai.usage.input_tokens": event.usage.input_tokens,
              "gen_ai.usage.output_tokens": event.usage.output_tokens,
              ...(event.usage.input_tokens_details
                ? {
                    "gen_ai.usage.cache_read.input_tokens":
                      event.usage.input_tokens_details.cached_tokens,
                  }
                : {}),
            }
          : {}),
        ...(event.content && event.kind === "transcript" && event.role === "user"
          ? { "tablecast.input": JSON.stringify([{ role: "user", content: event.content }]) }
          : event.content
            ? {
                "tablecast.output":
                  event.kind === "transcript"
                    ? JSON.stringify([{ role: event.role, content: event.content }])
                    : event.content,
              }
            : {}),
      },
      event.startedAt,
      event.endedAt,
    );
  }
  return { ok: true };
}
