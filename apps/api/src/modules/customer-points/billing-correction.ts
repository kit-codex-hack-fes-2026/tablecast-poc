import { and, eq, exists, isNotNull, notInArray, sql, sum } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import { customerPointAllocations, customerPointVisits } from "../../db/rewards-schema";
import { orders, payments, tableSessions } from "../../db/table-schema";
import { tablePlanSchema } from "../tables/model";
import { billValue } from "../tables/values";
import { pointRulesSchema } from "./model";
import { calculateAllocation, pointEntryStatement } from "./mutations";

export async function pointBillingCorrectionStatements(
  services: ApiServices,
  actor: Actor,
  amountDelta: number,
  reference: string,
  mutation: string,
) {
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
  const [visits, allocations] = await services.db.batch([
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
  ]);
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
  const gate = exists(
    services.db
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.id, visit.sessionId),
          eq(tableSessions.store_id, actor.storeId),
          eq(tableSessions.mutation_id, mutation),
        ),
      ),
  );
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
