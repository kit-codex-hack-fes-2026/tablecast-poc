import { and, eq, exists, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { z } from "zod";
import {
  customerConsumption,
  customerContexts,
  customerMemories,
  customerMemberships,
  customerMemorySources,
  customerVisitParticipants,
  confirmations,
  orders,
  tableEvents,
  tableSessions,
  voiceTurns,
} from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import type { CustomerActor } from "../customers/model";
import { requireCustomer } from "../customers/queries";
import { requireCustomerVisit } from "../customer-visits/queries";
import { snapshotSchema } from "../orders/model";
import { notifyStore } from "../tables/mutations";
import { stopVoiceRoom } from "../voice/runtime";
import { customerServiceTarget } from "./queries";
import type {
  customerAttributionSchema,
  customerConsumptionSchema,
  customerMemoryInputSchema,
  customerTargetSchema,
  saveCustomerMemorySchema,
} from "./model";

// 呼出し元の変更が一行成立した直後に同じbatchへ入れる。
export function resetCustomerContextStatements(
  services: ApiServices,
  storeId: string,
  scope: SQL | undefined,
  token: string,
  participantId: string | null = null,
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
            selectedParticipantId: sql<string | null>`${participantId}`.as(
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
    db.insert(tableEvents).select(
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
    ),
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
  token: string,
) {
  const contexts = await services.db
    .select()
    .from(customerContexts)
    .where(and(eq(customerContexts.storeId, storeId), eq(customerContexts.token, token)));
  await Promise.all(
    contexts.map(async (context) => {
      await notifyStore(services, storeId, context.sessionId);
      if (context.previousVoiceSessionId)
        await stopVoiceRoom(services, context.previousVoiceSessionId);
    }),
  );
}
export async function selectCustomerTarget(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof customerTargetSchema>,
) {
  ensure(actor.kind === "device", "DEVICE_REQUIRED", 403);
  const { context, session, participants } = await customerServiceTarget(services, actor);
  ensure(context?.token === input.token, "CUSTOMER_CONTEXT_STALE", 409);
  ensure(
    input.participantId === null ||
      participants.some((p) => p.participant.id === input.participantId),
    "CUSTOMER_TARGET_REQUIRED",
    422,
  );
  const token = crypto.randomUUID();
  const result = await services.db.batch([
    services.db
      .update(customerContexts)
      .set({ selectedParticipantId: input.participantId })
      .where(
        and(
          eq(customerContexts.sessionId, session.id),
          eq(customerContexts.storeId, actor.storeId),
          eq(customerContexts.token, input.token),
          exists(
            services.db
              .select({ id: tableSessions.id })
              .from(tableSessions)
              .where(and(eq(tableSessions.id, session.id), eq(tableSessions.status, "open"))),
          ),
        ),
      ),
    ...resetCustomerContextStatements(
      services,
      actor.storeId,
      eq(tableSessions.id, session.id),
      token,
      input.participantId,
    ),
  ]);
  ensure(result[0].meta.changes === 1, "CUSTOMER_CONTEXT_STALE", 409);
  await finishCustomerContextChange(services, actor.storeId, token);
  return { token, selectedParticipantId: input.participantId };
}
export async function writeCustomerMemory(
  services: ApiServices,
  actor: CustomerActor,
  input: z.infer<typeof customerMemoryInputSchema>,
) {
  const membership = await requireCustomer(services, actor);
  const now = Date.now();
  const gate = exists(
    services.db
      .select({ id: customerMemberships.id })
      .from(customerMemberships)
      .where(
        and(
          eq(customerMemberships.id, membership.id),
          eq(customerMemberships.active, true),
          eq(customerMemberships.revision, membership.revision),
        ),
      ),
  );
  const write =
    input.revision === 0
      ? services.db
          .insert(customerMemories)
          .select(
            services.db
              .select({
                id: sql<string>`${input.id}`.as("id"),
                storeId: customerMemberships.storeId,
                membershipId: customerMemberships.id,
                sourceId: sql<string | null>`NULL`.as("source_id"),
                sourceKind: sql<"manual">`'manual'`.as("source_kind"),
                content: sql<string>`${input.content}`.as("content"),
                revision: sql<number>`1`.as("revision"),
                edited: sql<boolean>`1`.as("edited"),
                deleted: sql<boolean>`0`.as("deleted"),
                createdAt: sql<number>`${now}`.as("created_at"),
                updatedAt: sql<number>`${now}`.as("updated_at"),
              })
              .from(customerMemberships)
              .where(and(eq(customerMemberships.id, membership.id), gate)),
          )
          .onConflictDoNothing()
      : services.db
          .update(customerMemories)
          .set({
            content: input.content,
            edited: true,
            revision: sql`${customerMemories.revision}+1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(customerMemories.id, input.id),
              eq(customerMemories.membershipId, membership.id),
              eq(customerMemories.storeId, actor.storeId),
              eq(customerMemories.revision, input.revision),
              eq(customerMemories.deleted, false),
              gate,
            ),
          );
  const token = crypto.randomUUID();
  const result = await services.db.batch([
    write,
    ...resetCustomerContextStatements(
      services,
      actor.storeId,
      customerSessionsScope(services, membership.id),
      token,
    ),
  ]);
  ensure(result[0].meta.changes === 1, "CUSTOMER_MEMORY_STALE", 409);
  await finishCustomerContextChange(services, actor.storeId, token);
  return { saved: true };
}
export async function deleteCustomerMemory(
  services: ApiServices,
  actor: CustomerActor,
  id: string,
  revision: number,
) {
  const membership = await requireCustomer(services, actor);
  const token = crypto.randomUUID();
  const result = await services.db.batch([
    services.db
      .update(customerMemories)
      .set({
        content: "",
        deleted: true,
        revision: sql`${customerMemories.revision}+1`,
        updatedAt: Date.now(),
      })
      .where(
        and(
          eq(customerMemories.id, id),
          eq(customerMemories.membershipId, membership.id),
          eq(customerMemories.storeId, actor.storeId),
          eq(customerMemories.revision, revision),
          eq(customerMemories.deleted, false),
        ),
      ),
    ...resetCustomerContextStatements(
      services,
      actor.storeId,
      customerSessionsScope(services, membership.id),
      token,
    ),
    services.db
      .update(customerMemorySources)
      .set({ content: "" })
      .where(
        and(
          eq(customerMemorySources.membershipId, membership.id),
          eq(customerMemorySources.storeId, actor.storeId),
          inArray(
            customerMemorySources.id,
            services.db
              .select({ id: customerMemories.sourceId })
              .from(customerMemories)
              .where(and(eq(customerMemories.id, id), eq(customerMemories.deleted, true))),
          ),
        ),
      ),
  ]);
  ensure(result[0].meta.changes === 1, "CUSTOMER_MEMORY_STALE", 409);
  await finishCustomerContextChange(services, actor.storeId, token);
  return { deleted: true };
}
export async function recordCustomerMemorySource(
  services: ApiServices,
  actor: Actor,
  text: string,
) {
  if (actor.demoId || !text.trim()) return;
  const { context, target, session } = await customerServiceTarget(services, actor);
  if (!context || !target?.membership.saveMemories || !session.voice_session_id || !actor.turnId)
    return;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${session.voice_session_id}:${text.trim()}`),
  );
  const id = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  await services.db
    .insert(customerMemorySources)
    .select(
      services.db
        .select({
          id: sql<string>`${id}`.as("id"),
          storeId: customerMemberships.storeId,
          membershipId: customerMemberships.id,
          sessionId: customerContexts.sessionId,
          voiceSessionId: sql<string>`${tableSessions.voice_session_id}`.as("voice_session_id"),
          turnId: sql<string>`${actor.turnId}`.as("turn_id"),
          contextToken: customerContexts.token,
          consentRevision: customerMemberships.revision,
          content: sql<string>`${text}`.as("content"),
          createdAt: sql<number>`${Date.now()}`.as("created_at"),
        })
        .from(customerMemberships)
        .innerJoin(customerContexts, eq(customerContexts.sessionId, session.id))
        .innerJoin(tableSessions, eq(tableSessions.id, session.id))
        .where(
          and(
            eq(customerMemberships.id, target.membership.id),
            eq(customerMemberships.active, true),
            eq(customerMemberships.saveMemories, true),
            eq(customerMemberships.revision, target.membership.revision),
            eq(customerContexts.token, context.token),
            eq(tableSessions.voice_session_id, session.voice_session_id),
            eq(tableSessions.active_turn_id, actor.turnId),
            eq(tableSessions.status, "open"),
          ),
        ),
    )
    .onConflictDoNothing();
}
export async function saveAutomaticCustomerMemory(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof saveCustomerMemorySchema>,
) {
  ensure(actor.kind === "voice" && actor.turnId && actor.voiceSessionId, "VOICE_REQUIRED", 403);
  const { context, target, session } = await customerServiceTarget(services, actor);
  ensure(context && target?.membership.saveMemories, "CUSTOMER_MEMORY_CONSENT_REQUIRED", 403);
  const source = await services.db
    .select()
    .from(customerMemorySources)
    .where(
      and(
        eq(customerMemorySources.id, input.sourceId),
        eq(customerMemorySources.membershipId, target.membership.id),
        eq(customerMemorySources.storeId, actor.storeId),
        eq(customerMemorySources.contextToken, context.token),
        eq(customerMemorySources.voiceSessionId, actor.voiceSessionId),
        eq(customerMemorySources.turnId, actor.turnId),
      ),
    )
    .get();
  ensure(source && source.content.includes(input.quote), "CUSTOMER_MEMORY_SOURCE_INVALID", 422);
  const now = Date.now();
  const rows = await services.db
    .insert(customerMemories)
    .select(
      services.db
        .select({
          id: sql<string>`${crypto.randomUUID()}`.as("id"),
          storeId: customerMemberships.storeId,
          membershipId: customerMemberships.id,
          sourceId: sql<string>`${source.id}`.as("source_id"),
          sourceKind: sql<"voice">`'voice'`.as("source_kind"),
          content: sql<string>`${input.quote}`.as("content"),
          revision: sql<number>`1`.as("revision"),
          edited: sql<boolean>`0`.as("edited"),
          deleted: sql<boolean>`0`.as("deleted"),
          createdAt: sql<number>`${now}`.as("created_at"),
          updatedAt: sql<number>`${now}`.as("updated_at"),
        })
        .from(customerMemberships)
        .innerJoin(customerContexts, eq(customerContexts.sessionId, session.id))
        .innerJoin(tableSessions, eq(tableSessions.id, session.id))
        .where(
          and(
            eq(customerMemberships.id, target.membership.id),
            eq(customerMemberships.storeId, actor.storeId),
            eq(customerMemberships.active, true),
            eq(customerMemberships.saveMemories, true),
            eq(customerMemberships.revision, source.consentRevision),
            eq(customerContexts.token, source.contextToken),
            eq(tableSessions.voice_session_id, actor.voiceSessionId),
            eq(tableSessions.active_turn_id, actor.turnId),
            eq(tableSessions.status, "open"),
          ),
        ),
    )
    .onConflictDoNothing()
    .returning({ id: customerMemories.id });
  return { saved: rows.length === 1 };
}
export async function recordCustomerConsumption(
  services: ApiServices,
  actor: CustomerActor,
  input: z.infer<typeof customerConsumptionSchema>,
) {
  const membership = await requireCustomer(services, actor);
  const order = await services.db
    .select()
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.store_id, actor.storeId)))
    .get();
  ensure(order, "ORDER_NOT_FOUND", 404);
  await requireCustomerVisit(services, actor, order.table_session_id);
  const line = snapshotSchema
    .parse(JSON.parse(order.snapshot_json))
    .lines.find((item) => item.id === input.lineId);
  ensure(line && input.quantity <= line.quantity, "CUSTOMER_CONSUMPTION_INVALID", 422);
  const now = Date.now();
  const values = {
    id: crypto.randomUUID(),
    storeId: actor.storeId,
    membershipId: membership.id,
    sessionId: order.table_session_id,
    orderId: order.id,
    lineId: line.id,
    productId: line.productId,
    quantity: input.quantity,
    shared: input.shared,
    createdAt: now,
    updatedAt: now,
  };
  const result =
    input.revision === 0
      ? await services.db
          .insert(customerConsumption)
          .select(
            services.db
              .select({
                id: sql<string>`${values.id}`.as("id"),
                storeId: customerMemberships.storeId,
                membershipId: customerMemberships.id,
                sessionId: sql<string>`${values.sessionId}`.as("session_id"),
                orderId: sql<string>`${values.orderId}`.as("order_id"),
                lineId: sql<string>`${values.lineId}`.as("line_id"),
                productId: sql<string>`${values.productId}`.as("product_id"),
                quantity: sql<number>`${values.quantity}`.as("quantity"),
                shared: sql<boolean>`${values.shared ? 1 : 0}`.as("shared"),
                revision: sql<number>`1`.as("revision"),
                createdAt: sql<number>`${now}`.as("created_at"),
                updatedAt: sql<number>`${now}`.as("updated_at"),
              })
              .from(customerMemberships)
              .where(
                and(
                  eq(customerMemberships.id, membership.id),
                  eq(customerMemberships.active, true),
                ),
              ),
          )
          .onConflictDoNothing()
          .returning({ id: customerConsumption.id })
      : await services.db
          .update(customerConsumption)
          .set({
            quantity: input.quantity,
            shared: input.shared,
            revision: sql`${customerConsumption.revision}+1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(customerConsumption.membershipId, membership.id),
              eq(customerConsumption.storeId, actor.storeId),
              eq(customerConsumption.orderId, order.id),
              eq(customerConsumption.lineId, line.id),
              eq(customerConsumption.revision, input.revision),
              exists(
                services.db
                  .select({ id: customerMemberships.id })
                  .from(customerMemberships)
                  .where(
                    and(
                      eq(customerMemberships.id, membership.id),
                      eq(customerMemberships.active, true),
                    ),
                  ),
              ),
            ),
          )
          .returning({ id: customerConsumption.id });
  ensure(result.length === 1, "CUSTOMER_CONSUMPTION_STALE", 409);
  return { saved: true };
}
export async function attributeCustomerConsumption(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof customerAttributionSchema>,
) {
  ensure(actor.kind === "device", "DEVICE_REQUIRED", 403);
  const { participants, session } = await customerServiceTarget(services, actor);
  const target = participants.find((p) => p.participant.id === input.participantId);
  ensure(target, "CUSTOMER_TARGET_REQUIRED", 422);
  const order = await services.db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.id, input.orderId),
        eq(orders.store_id, actor.storeId),
        eq(orders.table_session_id, session.id),
      ),
    )
    .get();
  ensure(order, "ORDER_NOT_FOUND", 404);
  return recordCustomerConsumption(
    services,
    { kind: "customer", storeId: actor.storeId, userId: target.membership.userId },
    input,
  );
}
