import { and, eq, exists, ne, notExists, sql } from "drizzle-orm";
import type { z } from "zod";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { notifyStore, voiceTurnEvent } from "../tables/mutations";
import { recordCustomerMemorySource } from "../customer-memory/service";
import { getSession } from "../tables/queries";
import type { VoiceDiagnostics } from "./diagnostics";
import { logVoiceTurn } from "./diagnostics";
import type { voiceTurnSchema } from "./model";
import { proactiveReservationCondition, voiceActor } from "./queries";

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
    db
      .delete(business.customerMemorySources)
      .where(
        and(
          eq(business.customerMemorySources.voiceSessionId, voiceSessionId),
          eq(business.customerMemorySources.turnId, turnId),
          notExists(
            db
              .select({ id: business.customerMemories.id })
              .from(business.customerMemories)
              .where(eq(business.customerMemories.sourceId, business.customerMemorySources.id)),
          ),
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
  if (result[1]?.meta.changes === 1 || result[5]?.meta.changes === 1) {
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
  requestSignal.throwIfAborted();
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
  if (!proactive) {
    const last = input.messages.findLast((message) => message.role === "user");
    if (last)
      await recordCustomerMemorySource(services, { ...actor, turnId: input.turnId }, last.content);
  }
  logVoiceTurn(diagnostics, "accepted");
  waitUntil(notifyStore(services, actor.storeId, actor.tableSessionId));
  return { kind: "accepted", turnId: input.turnId } as const;
}
