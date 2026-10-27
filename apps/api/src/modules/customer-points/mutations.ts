import type { BatchResponse } from "drizzle-orm/batch";
import type { z } from "zod";
import { and, eq, sql, type SQL } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { customerMemberships } from "../../db/customer-schema";
import {
  customerPointAllocations,
  customerPointEntries,
  customerPointPolicies,
  customerPointVisits,
} from "../../db/rewards-schema";
import { tableSessions } from "../../db/table-schema";
import { tablePlanSchema } from "../tables/model";
import { mutationGate } from "../tables/mutations";
import { billValue } from "../tables/values";
import { noPointRules, pointRulesSchema } from "./model";
import { pointBillingCorrectionQueries } from "./queries";

export function pointEntryStatement(
  services: ApiServices,
  actor: Pick<Actor, "storeId" | "userId">,
  membershipId: string,
  delta: number,
  kind: "award" | "correction" | "exchange",
  reference: string,
  reason: string,
  gate: SQL | undefined,
) {
  return services.db
    .insert(customerPointEntries)
    .select(
      services.db
        .select({
          id: sql<string>`${[Date.now().toString().padStart(16, "0"), crypto.randomUUID()].join(":")}`.as(
            "id",
          ),
          storeId: customerMemberships.storeId,
          membershipId: customerMemberships.id,
          delta: sql<number>`${delta}`.as("delta"),
          kind: sql<"award" | "correction" | "exchange">`${kind}`.as("kind"),
          reference: sql<string>`${reference}`.as("reference"),
          reason: sql<string>`${reason}`.as("reason"),
          createdBy: sql<string>`${actor.userId ?? "system"}`.as("created_by"),
          createdAt: sql<number>`${Date.now()}`.as("created_at"),
        })
        .from(customerMemberships)
        .where(
          and(
            eq(customerMemberships.storeId, actor.storeId),
            eq(customerMemberships.id, membershipId),
            gate,
          ),
        ),
    )
    .onConflictDoNothing();
}

export function calculateAllocation(
  total: number,
  count: number,
  position: number,
  rules: z.infer<typeof pointRulesSchema>,
) {
  const amount = count ? Math.floor(total / count) + (position < total % count ? 1 : 0) : 0;
  return {
    amount,
    points: rules.enabled
      ? rules.kind === "visit"
        ? rules.points
        : Math.floor(amount / rules.unitYen) * rules.points
      : 0,
  };
}

export function snapshotPointPolicy(services: ApiServices, storeId: string, sessionId: string) {
  const latest = services.db
    .select({ rules: customerPointPolicies.rulesJson })
    .from(customerPointPolicies)
    .where(eq(customerPointPolicies.storeId, storeId))
    .orderBy(sql`${customerPointPolicies.version} DESC`)
    .limit(1);
  return services.db.insert(customerPointVisits).select(
    services.db
      .select({
        sessionId: tableSessions.id,
        storeId: tableSessions.store_id,
        rulesJson: sql<string>`coalesce((${latest}),${JSON.stringify(noPointRules)})`.as(
          "rules_json",
        ),
        confirmedAt: sql<null | number>`NULL`.as("confirmed_at"),
        confirmedBy: sql<null | string>`NULL`.as("confirmed_by"),
        idempotencyKey: sql<null | string>`NULL`.as("idempotency_key"),
        recipientsJson: sql<string>`'[]'`.as("recipients_json"),
        mutationId: sql<null | string>`NULL`.as("mutation_id"),
      })
      .from(tableSessions)
      .where(
        and(eq(tableSessions.id, sessionId), eq(tableSessions.store_id, storeId), sql`changes()=1`),
      ),
  );
}

export async function pointBillingCorrectionStatements(
  services: ApiServices,
  actor: Actor,
  amountDelta: number,
  reference: string,
  mutation: string,
  known?: BatchResponse<ReturnType<typeof pointBillingCorrectionQueries>>,
) {
  const [visits, allocations] =
    known ?? (await services.db.batch(pointBillingCorrectionQueries(services, actor)));
  const visit = visits[0];
  if (!visit) return [];
  const rules = pointRulesSchema.parse(JSON.parse(visit.rulesJson));
  const amount =
    billValue(
      {
        orderedTotal: visit.orderedTotal,
        adjustmentTotal: visit.adjustmentTotal,
        paidTotal: 0,
        cartTotal: 0,
      },
      visit.planJson ? tablePlanSchema.parse(JSON.parse(visit.planJson)) : null,
      visit.guestCount,
    ).due + amountDelta;
  const gate = mutationGate(services, actor, mutation);
  return allocations.flatMap((allocation) => {
    const next = calculateAllocation(amount, allocations.length, allocation.position, rules);
    return [
      pointEntryStatement(
        services,
        actor,
        allocation.membershipId,
        next.points - allocation.points,
        "correction",
        `billing:${visit.sessionId}:${reference}`,
        "会計訂正による差分 / Bill correction",
        gate,
      ),
      services.db
        .update(customerPointAllocations)
        .set(next)
        .where(
          and(
            eq(customerPointAllocations.sessionId, visit.sessionId),
            eq(customerPointAllocations.membershipId, allocation.membershipId),
            eq(customerPointAllocations.storeId, actor.storeId),
            gate,
          ),
        ),
    ];
  });
}
