import type { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import type { saveCustomerMemorySchema } from "../model";
import {
  customerContexts,
  customerMemberships,
  customerMemories,
  customerMemorySources,
} from "../../../db/customer-schema";
import { tableSessions } from "../../../db/table-schema";
import { ensure } from "../../../platform/errors";
import { customerServiceTarget } from "../queries";

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
