import type { z } from "zod";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lt,
  max,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { CustomerActor } from "../customers/model";
import type { customerMemoryPageSchema, customerSuggestionsSchema } from "./model";
import {
  customerConsumption,
  customerContexts,
  customerMemberships,
  customerMemories,
  customerMemorySources,
  customerVisitParticipants,
} from "../../db/customer-schema";
import { user } from "../../db/identity-schema";
import {
  customerCoupons,
  customerPointAllocations,
  customerPointVisits,
} from "../../db/rewards-schema";
import { orders, tableSessions } from "../../db/table-schema";
import { ensure } from "../../platform/errors";
import { getCatalog } from "../catalog/queries";
import { couponRuleSchema } from "../customer-coupons/model";
import { pointBalance } from "../customer-points/queries";
import { requireCustomer } from "../customers/queries";
import { snapshotSchema } from "../orders/model";
import { getSession } from "../tables/queries";

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
function customerReadGate(
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

function customerReadProof(services: ApiServices, gate: ReturnType<typeof customerReadGate>) {
  return services.db
    .select({ id: customerContexts.sessionId })
    .from(customerContexts)
    .where(gate)
    .limit(1);
}

export async function listCustomerMemories(
  services: ApiServices,
  actor: CustomerActor,
  query: z.infer<typeof customerMemoryPageSchema>,
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
  query: z.infer<typeof customerMemoryPageSchema>,
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
      customer: null,
    };
  const gate = customerReadGate(services, actor, snapshot);
  const personalGate = and(gate, sql`${target.membership.useMemories}=1`);
  const now = Date.now();
  const [valid, memories, consumption, sources, profiles, visits, coupons] =
    await services.db.batch([
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
      services.db
        .select({
          displayName: user.name,
          pointsBalance:
            sql<number>`(${pointBalance(services, actor.storeId, target.membership.id)})`.mapWith(
              Number,
            ),
        })
        .from(user)
        .where(and(personalGate, eq(user.id, target.membership.userId)))
        .limit(1),
      services.db
        .select({
          count: count(),
          lastVisitedAt: max(tableSessions.opened_at),
        })
        .from(customerPointAllocations)
        .innerJoin(
          customerPointVisits,
          and(
            eq(customerPointVisits.sessionId, customerPointAllocations.sessionId),
            eq(customerPointVisits.storeId, actor.storeId),
            isNotNull(customerPointVisits.confirmedAt),
          ),
        )
        .innerJoin(
          tableSessions,
          and(
            eq(tableSessions.id, customerPointVisits.sessionId),
            eq(tableSessions.store_id, actor.storeId),
          ),
        )
        .where(
          and(
            personalGate,
            eq(customerPointAllocations.storeId, actor.storeId),
            eq(customerPointAllocations.membershipId, target.membership.id),
            ne(customerPointAllocations.sessionId, session.id),
          ),
        ),
      services.db
        .select({ snapshot: customerCoupons.snapshotJson })
        .from(customerCoupons)
        .where(
          and(
            personalGate,
            eq(customerCoupons.storeId, actor.storeId),
            eq(customerCoupons.membershipId, target.membership.id),
            or(
              eq(customerCoupons.state, "available"),
              and(
                eq(customerCoupons.state, "requested"),
                eq(customerCoupons.requestedSessionId, session.id),
              ),
            ),
            sql`json_extract(${customerCoupons.snapshotJson},'$.startsAt')<=${now}`,
            sql`json_extract(${customerCoupons.snapshotJson},'$.endsAt')>${now}`,
          ),
        )
        .orderBy(
          asc(sql`json_extract(${customerCoupons.snapshotJson},'$.endsAt')`),
          asc(customerCoupons.id),
        )
        .limit(6),
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
    customer:
      target.membership.useMemories && profiles[0]
        ? {
            ...profiles[0],
            confirmedVisits: visits[0] ?? { count: 0, lastVisitedAt: null },
            coupons: coupons.slice(0, 5).map(({ snapshot: couponSnapshot }) => {
              const rules = couponRuleSchema.parse(JSON.parse(couponSnapshot));
              return {
                title: rules.title[session.locale],
                description: rules.description[session.locale],
                minimumYen: rules.minimumYen,
                discountKind: rules.discountKind,
                discountValue: rules.discountValue,
                maximumYen: rules.maximumYen,
                endsAt: rules.endsAt,
              };
            }),
            moreCoupons: coupons.length > 5,
          }
        : null,
  };
}

export async function customerSuggestions(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof customerSuggestionsSchema>,
) {
  const snapshot = await customerServiceTarget(services, actor);
  const { session, participants, target } = snapshot;
  const gate = customerReadGate(services, actor, snapshot);
  if (input.kind !== "companions" && (!target || !target.membership.useMemories))
    return { needsTarget: !target, products: [], more: false };
  const catalog = await getCatalog(services, actor.storeId);
  let counts = new Map<string, number>();
  if (input.kind === "companions") {
    if (!participants.length) return { needsTarget: false, products: [], more: false };
    const ids = participants.map((p) => p.membership.id);
    // 同行共有と来店中利用を全員が許可した同じ構成の来店だけを読む。
    const permitted = await services.db
      .select({ id: customerMemberships.id })
      .from(customerMemberships)
      .where(
        and(
          inArray(customerMemberships.id, ids),
          eq(customerMemberships.storeId, actor.storeId),
          eq(customerMemberships.active, true),
          eq(customerMemberships.useMemories, true),
          eq(customerMemberships.shareCompanions, true),
        ),
      );
    if (permitted.length !== ids.length) return { needsTarget: false, products: [], more: false };
    const groups = services.db
      .select({ id: customerVisitParticipants.sessionId })
      .from(customerVisitParticipants)
      .where(
        and(
          eq(customerVisitParticipants.storeId, actor.storeId),
          ne(customerVisitParticipants.sessionId, session.id),
        ),
      )
      .groupBy(customerVisitParticipants.sessionId)
      .having(
        sql`count(*)=${ids.length} AND sum(CASE WHEN ${inArray(customerVisitParticipants.membershipId, ids)} THEN 1 ELSE 0 END)=${ids.length}`,
      );
    const past = await services.db
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.store_id, actor.storeId),
          eq(tableSessions.status, "closed"),
          inArray(tableSessions.id, groups),
        ),
      )
      .orderBy(desc(tableSessions.closed_at))
      .limit(1)
      .get();
    if (!past) return { needsTarget: false, products: [], more: false };
    const [valid, shared] = await services.db.batch([
      customerReadProof(services, gate),
      services.db
        .select({ snapshot: orders.snapshot_json })
        .from(orders)
        .where(
          and(
            eq(orders.store_id, actor.storeId),
            eq(orders.table_session_id, past.id),
            inArray(orders.status, ["accepted", "served"]),
            gate,
          ),
        ),
    ]);
    ensure(valid.length === 1, "CUSTOMER_CONTEXT_STALE", 409);
    for (const order of shared)
      for (const line of snapshotSchema.parse(JSON.parse(order.snapshot)).lines)
        counts.set(line.productId, (counts.get(line.productId) ?? 0) + line.quantity);
  } else {
    ensure(target, "CUSTOMER_TARGET_REQUIRED", 422);
    const [valid, rows] = await services.db.batch([
      customerReadProof(services, gate),
      services.db
        .select({
          productId: customerConsumption.productId,
          quantity: sql<number>`sum(${customerConsumption.quantity})`.mapWith(Number),
        })
        .from(customerConsumption)
        .innerJoin(
          orders,
          and(eq(orders.id, customerConsumption.orderId), eq(orders.store_id, actor.storeId)),
        )
        .where(
          and(
            eq(customerConsumption.storeId, actor.storeId),
            eq(customerConsumption.membershipId, target.membership.id),
            gate,
            sql`${customerConsumption.productId} IN (SELECT value FROM json_each(${JSON.stringify(catalog.configuration.products.map((p) => p.id))}))`,
          ),
        )
        .groupBy(customerConsumption.productId),
    ]);
    ensure(valid.length === 1, "CUSTOMER_CONTEXT_STALE", 409);
    counts = new Map(rows.map((row) => [row.productId, row.quantity]));
  }
  const candidates = catalog.configuration.products
    .filter(
      (p) =>
        p.available &&
        (input.kind === "untried" ? !(counts.get(p.id) ?? 0) : (counts.get(p.id) ?? 0) > 0),
    )
    .toSorted((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  return {
    needsTarget: false,
    version: catalog.version,
    products: candidates.slice(input.offset, input.offset + 8).map((p) => ({
      id: p.id,
      name: p.text[session.locale].displayName,
      price: p.price,
      previousQuantity: counts.get(p.id) ?? 0,
    })),
    more: input.offset + 8 < candidates.length,
    nextOffset: input.offset + 8,
    requiresCurrentOptions: true,
  };
}
