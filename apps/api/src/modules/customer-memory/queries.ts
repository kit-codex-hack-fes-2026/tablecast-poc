import { and, desc, eq, exists, isNull, lt, or, sql } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { CustomerActor } from "../customers/model";
import {
  customerConsumption,
  customerContexts,
  customerMemberships,
  customerMemories,
  customerMemorySources,
  customerVisitParticipants,
} from "../../db/customer-schema";
import { orders, tableSessions } from "../../db/table-schema";
import { ensure } from "../../platform/errors";
import { requireCustomer } from "../customers/queries";
import { snapshotSchema } from "../orders/model";
import { getSession } from "../tables/session";

function currentCustomerParticipants(services: ApiServices, storeId: string, sessionId: string) {
  return services.db
    .select({
      participant: { id: sql<string>`${customerVisitParticipants.id}`.as("target_participant_id") },
      membership: {
        id: sql<string>`${customerMemberships.id}`.as("target_membership_id"),
        userId: sql<string>`${customerMemberships.userId}`.as("target_user_id"),
        revision: sql<number>`${customerMemberships.revision}`.as("target_revision"),
        saveMemories: sql<number>`${customerMemberships.saveMemories}`.as("target_save_memories"),
        useMemories: sql<number>`${customerMemberships.useMemories}`.as("target_use_memories"),
      },
    })
    .from(customerVisitParticipants)
    .innerJoin(
      customerMemberships,
      and(
        eq(customerMemberships.id, customerVisitParticipants.membershipId),
        eq(customerMemberships.storeId, storeId),
        eq(customerMemberships.active, true),
      ),
    )
    .where(
      and(
        eq(customerVisitParticipants.storeId, storeId),
        eq(customerVisitParticipants.sessionId, sessionId),
        isNull(customerVisitParticipants.leftAt),
      ),
    );
}

export async function customerServiceTarget(services: ApiServices, actor: Actor) {
  ensure(
    (actor.kind === "device" || actor.kind === "voice") && !actor.demoId,
    "CUSTOMER_CONTEXT_FORBIDDEN",
    403,
  );
  const session = await getSession(services, actor);
  const [contexts, participants] = await services.db.batch([
    services.db
      .select()
      .from(customerContexts)
      .where(
        and(
          eq(customerContexts.sessionId, session.id),
          eq(customerContexts.storeId, actor.storeId),
        ),
      ),
    currentCustomerParticipants(services, actor.storeId, session.id),
  ]);
  const context = contexts[0];
  const target = context?.selectedParticipantId
    ? participants.find((person) => person.participant.id === context.selectedParticipantId)
    : participants.length === 1
      ? participants[0]
      : undefined;
  return { session, context, participants, target };
}

// 最初に選んだ対象・同意と、読取り時点の来店・音声状態を同じSQLで照合する。
export function customerReadGate(
  services: ApiServices,
  actor: Actor,
  snapshot: Awaited<ReturnType<typeof customerServiceTarget>>,
) {
  const { session, context, participants } = snapshot;
  if (!context) return sql`0`;
  const current = currentCustomerParticipants(services, actor.storeId, session.id).as(
    "current_customer_readers",
  );
  const matching = services.db
    .select({ count: sql<number>`count(*)` })
    .from(current)
    .where(
      participants.length
        ? or(
            ...participants.map((person) =>
              and(
                eq(current.membership.id, person.membership.id),
                eq(current.membership.revision, person.membership.revision),
              ),
            ),
          )
        : sql`0`,
    );
  return exists(
    services.db
      .select({ id: customerContexts.sessionId })
      .from(customerContexts)
      .innerJoin(
        tableSessions,
        and(
          eq(tableSessions.id, customerContexts.sessionId),
          eq(tableSessions.store_id, actor.storeId),
        ),
      )
      .where(
        and(
          eq(customerContexts.sessionId, session.id),
          eq(customerContexts.storeId, actor.storeId),
          eq(customerContexts.token, context.token),
          eq(tableSessions.status, "open"),
          sql`(${matching})=${participants.length}`,
          actor.kind === "voice"
            ? and(
                eq(tableSessions.voice_session_id, actor.voiceSessionId ?? ""),
                eq(tableSessions.voice_state, "active"),
                actor.turnId ? eq(tableSessions.active_turn_id, actor.turnId) : undefined,
              )
            : undefined,
        ),
      ),
  );
}

export function customerReadProof(
  services: ApiServices,
  gate: ReturnType<typeof customerReadGate>,
) {
  return services.db
    .select({ id: customerContexts.sessionId })
    .from(customerContexts)
    .where(gate)
    .limit(1);
}

export async function listCustomerMemories(
  services: ApiServices,
  actor: CustomerActor,
  query: { beforeId?: string; limit: number },
) {
  const membership = await requireCustomer(services, actor);
  const rows = await services.db
    .select({
      id: customerMemories.id,
      content: customerMemories.content,
      revision: customerMemories.revision,
      sourceKind: customerMemories.sourceKind,
      createdAt: customerMemories.createdAt,
      updatedAt: customerMemories.updatedAt,
    })
    .from(customerMemories)
    .where(
      and(
        eq(customerMemories.membershipId, membership.id),
        eq(customerMemories.storeId, actor.storeId),
        eq(customerMemories.deleted, false),
        query.beforeId ? lt(customerMemories.id, query.beforeId) : undefined,
      ),
    )
    .orderBy(desc(customerMemories.id))
    .limit(query.limit + 1);
  const memories = rows.slice(0, query.limit);
  return { memories, nextCursor: rows.length > query.limit ? (memories.at(-1)?.id ?? null) : null };
}

export async function listCustomerConsumption(
  services: ApiServices,
  actor: CustomerActor,
  query: { beforeId?: string; limit: number },
) {
  const membership = await requireCustomer(services, actor);
  const rows = await services.db
    .select({ record: customerConsumption, snapshot: orders.snapshot_json, status: orders.status })
    .from(customerConsumption)
    .innerJoin(
      orders,
      and(eq(orders.id, customerConsumption.orderId), eq(orders.store_id, actor.storeId)),
    )
    .where(
      and(
        eq(customerConsumption.storeId, actor.storeId),
        eq(customerConsumption.membershipId, membership.id),
        query.beforeId ? lt(customerConsumption.id, query.beforeId) : undefined,
      ),
    )
    .orderBy(desc(customerConsumption.id))
    .limit(query.limit + 1);
  const records = rows.slice(0, query.limit).map(({ record, snapshot, status }) => ({
    ...record,
    name: snapshotSchema.parse(JSON.parse(snapshot)).lines.find((line) => line.id === record.lineId)
      ?.name,
    orderStatus: status,
  }));
  return { records, nextCursor: rows.length > query.limit ? (records.at(-1)?.id ?? null) : null };
}

export async function customerRecommendationContext(services: ApiServices, actor: Actor) {
  const snapshot = await customerServiceTarget(services, actor);
  const { session, context, participants, target } = snapshot;
  if (!target || !context)
    return {
      mode: "shared",
      needsTarget: participants.length > 1,
      memories: [],
      consumption: [],
      source: null,
    };
  const gate = customerReadGate(services, actor, snapshot);
  const [valid, memories, consumption, sources] = await services.db.batch([
    customerReadProof(services, gate),
    services.db
      .select({ content: customerMemories.content })
      .from(customerMemories)
      .where(
        and(
          gate,
          eq(customerMemories.membershipId, target.membership.id),
          sql`${target.membership.useMemories}=1`,
          eq(customerMemories.storeId, actor.storeId),
          eq(customerMemories.deleted, false),
        ),
      )
      .orderBy(desc(customerMemories.updatedAt))
      .limit(21),
    services.db
      .select({
        productId: customerConsumption.productId,
        quantity: sql<number>`sum(${customerConsumption.quantity})`.mapWith(Number),
      })
      .from(customerConsumption)
      .innerJoin(orders, and(eq(orders.id, customerConsumption.orderId)))
      .where(
        and(
          gate,
          eq(customerConsumption.membershipId, target.membership.id),
          sql`${target.membership.useMemories}=1`,
          eq(customerConsumption.storeId, actor.storeId),
        ),
      )
      .groupBy(customerConsumption.productId)
      .orderBy(desc(sql`max(${customerConsumption.updatedAt})`))
      .limit(51),
    services.db
      .select({ id: customerMemorySources.id, content: customerMemorySources.content })
      .from(customerMemorySources)
      .where(
        and(
          gate,
          eq(customerMemorySources.membershipId, target.membership.id),
          eq(customerMemorySources.contextToken, context.token),
          eq(customerMemorySources.voiceSessionId, session.voice_session_id ?? ""),
          eq(customerMemorySources.turnId, actor.turnId ?? ""),
        ),
      )
      .limit(1),
  ]);
  ensure(valid.length === 1, "CUSTOMER_CONTEXT_STALE", 409);
  return {
    mode: target.membership.useMemories ? "personal" : "permission-disabled",
    needsTarget: false,
    memories: memories.slice(0, 20),
    consumption: consumption.slice(0, 50),
    moreMemories: memories.length > 20,
    moreConsumption: consumption.length > 50,
    source: target.membership.saveMemories ? (sources[0] ?? null) : null,
  };
}
