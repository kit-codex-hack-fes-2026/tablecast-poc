import type { z } from "zod";
import { and, asc, desc, eq, isNotNull, lt, notInArray, sql, sum } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { CustomerActor } from "../customers/model";
import type { pointPageSchema } from "./model";
import { customerMemberships, customerVisitParticipants } from "../../db/customer-schema";
import { user } from "../../db/identity-schema";
import {
  customerPointAllocations,
  customerPointEntries,
  customerPointPolicies,
  customerPointVisits,
} from "../../db/rewards-schema";
import { orders, payments, tableSessions } from "../../db/table-schema";
import { ensure } from "../../platform/errors";
import { requireCustomer } from "../customers/queries";
import { getSession } from "../tables/queries";
import { noPointRules, pointRulesSchema } from "./model";
export function pointBalance(services: ApiServices, storeId: string, membershipId: string) {
  return services.db
    .select({
      balance: sql<number>`coalesce(sum(${customerPointEntries.delta}),0)`.mapWith(Number),
    })
    .from(customerPointEntries)
    .where(
      and(
        eq(customerPointEntries.storeId, storeId),
        eq(customerPointEntries.membershipId, membershipId),
      ),
    );
}
export async function getPointPolicy(services: ApiServices, actor: Actor) {
  ensure(actor.kind === "staff" || actor.kind === "mcp", "STAFF_REQUIRED", 403);
  const row = await services.db
    .select()
    .from(customerPointPolicies)
    .where(eq(customerPointPolicies.storeId, actor.storeId))
    .orderBy(desc(customerPointPolicies.version))
    .limit(1)
    .get();
  return {
    version: row?.version ?? 0,
    rules: row ? pointRulesSchema.parse(JSON.parse(row.rulesJson)) : noPointRules,
  };
}
export async function getPointVisit(services: ApiServices, actor: Actor) {
  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const session = await getSession(services, actor);
  const [visits, participants, allocations] = await services.db.batch([
    services.db
      .select()
      .from(customerPointVisits)
      .where(
        and(
          eq(customerPointVisits.sessionId, session.id),
          eq(customerPointVisits.storeId, actor.storeId),
        ),
      ),
    services.db
      .select({
        id: sql<string>`${customerVisitParticipants.id}`.as("participant_id"),
        membershipId: sql<string>`${customerMemberships.id}`.as("membership_id"),
        name: user.name,
        email: user.email,
        image: user.image,
        active: customerMemberships.active,
        joinedAt: customerVisitParticipants.joinedAt,
        leftAt: customerVisitParticipants.leftAt,
      })
      .from(customerVisitParticipants)
      .innerJoin(
        customerMemberships,
        and(
          eq(customerMemberships.id, customerVisitParticipants.membershipId),
          eq(customerMemberships.storeId, actor.storeId),
        ),
      )
      .innerJoin(user, eq(user.id, customerMemberships.userId))
      .where(
        and(
          eq(customerVisitParticipants.sessionId, session.id),
          eq(customerVisitParticipants.storeId, actor.storeId),
        ),
      )
      .orderBy(asc(customerVisitParticipants.joinedAt), asc(customerVisitParticipants.id)),
    services.db
      .select()
      .from(customerPointAllocations)
      .where(
        and(
          eq(customerPointAllocations.sessionId, session.id),
          eq(customerPointAllocations.storeId, actor.storeId),
        ),
      )
      .orderBy(asc(customerPointAllocations.position)),
  ]);
  const visit = visits[0];

  return {
    sessionId: session.id,
    expectedVersion: session.cart_version,
    rules: visit ? pointRulesSchema.parse(JSON.parse(visit.rulesJson)) : noPointRules,
    confirmedAt: visit?.confirmedAt ?? null,
    participants,
    allocations,
    idempotencyKey: visit?.idempotencyKey ?? null,
  };
}
export async function getCustomerPoints(
  services: ApiServices,
  actor: CustomerActor,
  query: z.infer<typeof pointPageSchema>,
) {
  const membership = await requireCustomer(services, actor);
  const [balance, rows, totals] = await services.db.batch([
    pointBalance(services, actor.storeId, membership.id),
    services.db
      .select({
        id: customerPointEntries.id,
        delta: customerPointEntries.delta,
        kind: customerPointEntries.kind,
        reason: customerPointEntries.reason,
        reasonKind: sql<
          "award" | "billing" | "exchange" | "manual"
        >`CASE WHEN ${customerPointEntries.kind}='award' THEN 'award' WHEN ${customerPointEntries.kind}='exchange' THEN 'exchange' WHEN ${customerPointEntries.reference} LIKE 'billing:%' THEN 'billing' ELSE 'manual' END`.as(
          "reason_kind",
        ),
        createdAt: customerPointEntries.createdAt,
      })
      .from(customerPointEntries)
      .where(
        and(
          eq(customerPointEntries.storeId, actor.storeId),
          eq(customerPointEntries.membershipId, membership.id),
          query.beforeId ? lt(customerPointEntries.id, query.beforeId) : undefined,
        ),
      )
      .orderBy(desc(customerPointEntries.id))
      .limit(query.limit + 1),
    services.db
      .select({
        visits: sql<number>`count(*)`.mapWith(Number),
        allocatedYen: sql<number>`coalesce(sum(${customerPointAllocations.amount}),0)`.mapWith(
          Number,
        ),
      })
      .from(customerPointAllocations)
      .innerJoin(
        customerPointVisits,
        and(
          eq(customerPointVisits.sessionId, customerPointAllocations.sessionId),
          isNotNull(customerPointVisits.confirmedAt),
        ),
      )
      .where(
        and(
          eq(customerPointAllocations.storeId, actor.storeId),
          eq(customerPointAllocations.membershipId, membership.id),
        ),
      ),
  ]);
  const entries = rows.slice(0, query.limit);
  return {
    balance: balance[0]?.balance ?? 0,
    entries,
    totals: totals[0] ?? { visits: 0, allocatedYen: 0 },
    nextCursor: rows.length > query.limit ? (entries.at(-1)?.id ?? null) : null,
  };
}

export function pointBillingCorrectionQueries(services: ApiServices, actor: Actor) {
  // 配分の合計ではなく会計原本を読み、呼出し元の会計版で成立する差額だけを反映する。
  const orderedTotal = services.db
    .select({ total: sum(orders.total) })
    .from(orders)
    .where(
      and(
        eq(orders.store_id, actor.storeId),
        eq(orders.table_session_id, actor.tableSessionId ?? ""),
        notInArray(orders.status, ["cancelled", "rejected"]),
      ),
    );
  const adjustmentTotal = services.db
    .select({ total: sum(payments.amount) })
    .from(payments)
    .where(
      and(
        eq(payments.store_id, actor.storeId),
        eq(payments.table_session_id, actor.tableSessionId ?? ""),
        eq(payments.kind, "adjustment"),
      ),
    );
  return [
    services.db
      .select({
        sessionId: customerPointVisits.sessionId,
        rulesJson: customerPointVisits.rulesJson,
        planJson: tableSessions.plan_json,
        guestCount: tableSessions.guest_count,
        orderedTotal: sql<number>`coalesce((${orderedTotal}),0)`.mapWith(Number),
        adjustmentTotal: sql<number>`coalesce((${adjustmentTotal}),0)`.mapWith(Number),
      })
      .from(customerPointVisits)
      .innerJoin(
        tableSessions,
        and(
          eq(tableSessions.id, customerPointVisits.sessionId),
          eq(tableSessions.store_id, customerPointVisits.storeId),
        ),
      )
      .where(
        and(
          eq(customerPointVisits.sessionId, actor.tableSessionId ?? ""),
          eq(customerPointVisits.storeId, actor.storeId),
          isNotNull(customerPointVisits.confirmedAt),
        ),
      ),
    services.db
      .select()
      .from(customerPointAllocations)
      .where(
        and(
          eq(customerPointAllocations.sessionId, actor.tableSessionId ?? ""),
          eq(customerPointAllocations.storeId, actor.storeId),
        ),
      ),
  ] as const;
}
