import { and, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import { customerContexts, customerVisitParticipants } from "../../db/customer-schema";
import { confirmations, tableEvents, tableSessions, voiceTurns } from "../../db/table-schema";
import { notifyStore } from "../tables/mutations";
import { stopVoiceRoom } from "../voice/runtime";

// 呼出し元の変更が一行成立した直後に同じbatchへ入れる。
export function resetCustomerContextStatements(
  services: ApiServices,
  storeId: string,
  scope: SQL | undefined,
  token: string,
  participantId: null | string = null,
) {
  const { db } = services;
  const changed = db
    .select({ id: customerContexts.sessionId })
    .from(customerContexts)
    .where(and(eq(customerContexts.storeId, storeId), eq(customerContexts.token, token)));
  return [
    db
      .insert(customerContexts)
      .select(
        db
          .select({
            sessionId: tableSessions.id,
            storeId: tableSessions.store_id,
            token: sql<string>`${token}`.as("token"),
            selectedParticipantId: sql<null | string>`${participantId}`.as(
              "selected_participant_id",
            ),
            previousVoiceSessionId: tableSessions.voice_session_id,
          })
          .from(tableSessions)
          .where(and(eq(tableSessions.store_id, storeId), scope, sql`changes()=1`)),
      )
      .onConflictDoUpdate({
        target: customerContexts.sessionId,
        set: {
          token,
          selectedParticipantId: participantId,
          previousVoiceSessionId: sql`excluded.previous_voice_session_id`,
        },
      })
      .returning({
        sessionId: customerContexts.sessionId,
        previousVoiceSessionId: customerContexts.previousVoiceSessionId,
        sessionKind: sql<
          "demo" | "table"
        >`(${db.select({ kind: tableSessions.kind }).from(tableSessions).where(eq(tableSessions.id, customerContexts.sessionId))})`,
      }),
    db
      .update(tableSessions)
      .set({
        voice_state: "stopped",
        voice_session_id: null,
        active_turn_id: null,
        voice_version: sql`${tableSessions.voice_version}+1`,
        mutation_id: token,
      })
      .where(and(eq(tableSessions.store_id, storeId), inArray(tableSessions.id, changed))),
    db
      .update(confirmations)
      .set({ status: "invalid" })
      .where(
        and(
          eq(confirmations.store_id, storeId),
          inArray(confirmations.table_session_id, changed),
          inArray(confirmations.status, ["pending", "read"]),
        ),
      ),
    db
      .update(voiceTurns)
      .set({ status: "interrupted", ended_at: Date.now() })
      .where(
        and(
          eq(voiceTurns.store_id, storeId),
          inArray(voiceTurns.table_session_id, changed),
          eq(voiceTurns.status, "started"),
        ),
      ),
    // 字幕を次の個人文脈へ持ち越さない。注文・会計原本には触れない。
    db
      .delete(tableEvents)
      .where(
        and(
          eq(tableEvents.store_id, storeId),
          inArray(tableEvents.table_session_id, changed),
          inArray(tableEvents.kind, ["voice.user", "voice.assistant"]),
        ),
      ),
    db
      .insert(tableEvents)
      .select(
        db
          .select({
            cursor: sql<number>`NULL`.as("cursor"),
            store_id: tableSessions.store_id,
            table_session_id: tableSessions.id,
            kind: sql<string>`'customer.context-reset'`.as("kind"),
            data_json: sql<string>`'{}'`.as("data_json"),
            created_at: sql<number>`${Date.now()}`.as("created_at"),
          })
          .from(tableSessions)
          .where(and(eq(tableSessions.store_id, storeId), inArray(tableSessions.id, changed))),
      )
      .returning({ cursor: tableEvents.cursor, sessionId: tableEvents.table_session_id }),
  ] as const;
}

export function customerSessionsScope(services: ApiServices, membershipId: string) {
  return and(
    eq(tableSessions.status, "open"),
    inArray(
      tableSessions.id,
      services.db
        .select({ id: customerVisitParticipants.sessionId })
        .from(customerVisitParticipants)
        .where(
          and(
            eq(customerVisitParticipants.membershipId, membershipId),
            isNull(customerVisitParticipants.leftAt),
          ),
        ),
    ),
  );
}

export async function finishCustomerContextChange(
  services: ApiServices,
  storeId: string,
  contexts: readonly {
    previousVoiceSessionId: null | string;
    sessionId: string;
    sessionKind: "demo" | "table";
  }[],
  events: readonly { cursor: number; sessionId: null | string }[],
) {
  // 同じbatchのRETURNINGで停止対象・確定cursor・通知scopeを保持する。
  const contextsBySession = new Map(contexts.map((context) => [context.sessionId, context]));
  const notifications = new Map<string, { cursor: number; demoId?: string }>();
  for (const event of events) {
    const context = event.sessionId ? contextsBySession.get(event.sessionId) : undefined;
    if (!context) continue;
    const demoId = context.sessionKind === "demo" ? context.sessionId : undefined;
    const scope = demoId ?? storeId;
    notifications.set(scope, {
      cursor: Math.max(notifications.get(scope)?.cursor ?? 0, event.cursor),
      demoId,
    });
  }
  await Promise.all(
    [...notifications.values()].map((event) => notifyStore(services, storeId, undefined, event)),
  );
  await Promise.all(
    contexts.flatMap((context) =>
      context.previousVoiceSessionId
        ? [stopVoiceRoom(services, context.previousVoiceSessionId)]
        : [],
    ),
  );
}
