import { and, eq, gt, inArray, lte, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import { customerMemberships } from "../../db/customer-schema";
import {
  customerCouponRules,
  customerCoupons,
  customerPointAllocations,
  customerPointVisits,
} from "../../db/rewards-schema";
import { couponEvent } from "./mutations";

// 実行・commitは入会、ポイント確定、会計訂正を所有するuse-caseへ任せる。
function eligibleCouponStatements(
  services: ApiServices,
  storeId: string,
  targets: SQLWrapper,
  event: "enrol" | "visit",
  gate?: SQL,
) {
  const { db } = services;
  const token = crypto.randomUUID();
  const now = Date.now();
  const totals = db
    .select({
      membershipId: sql<string>`${customerPointAllocations.membershipId}`.as(
        "reward_membership_id",
      ),
      visits: sql<number>`count(*)`.as("reward_visits"),
      amount: sql<number>`sum(${customerPointAllocations.amount})`.as("reward_amount"),
    })
    .from(customerPointAllocations)
    .innerJoin(
      customerPointVisits,
      and(
        eq(customerPointVisits.sessionId, customerPointAllocations.sessionId),
        eq(customerPointVisits.storeId, storeId),
        sql`${customerPointVisits.confirmedAt} IS NOT NULL`,
      ),
    )
    .where(
      and(
        eq(customerPointAllocations.storeId, storeId),
        inArray(customerPointAllocations.membershipId, targets),
      ),
    )
    .groupBy(customerPointAllocations.membershipId)
    .as("reward_totals");
  const trigger = sql<string>`json_extract(${customerCouponRules.rulesJson},'$.trigger')`;
  const threshold = sql<number>`json_extract(${customerCouponRules.rulesJson},'$.threshold')`;
  const eligible =
    event === "enrol"
      ? and(eq(trigger, "enrol"), lte(customerCouponRules.createdAt, customerMemberships.joinedAt))
      : or(
          and(eq(trigger, "visits"), sql`coalesce(${totals.visits},0)>=${threshold}`),
          and(eq(trigger, "spend"), sql`coalesce(${totals.amount},0)>=${threshold}`),
        );
  return [
    db
      .insert(customerCoupons)
      .select(
        db
          .select({
            id: sql<string>`${now.toString().padStart(16, "0")} || ':' || lower(hex(randomblob(16)))`.as(
              "id",
            ),
            storeId: customerMemberships.storeId,
            membershipId: customerMemberships.id,
            ruleId: customerCouponRules.id,
            ruleVersion: customerCouponRules.version,
            snapshotJson: customerCouponRules.rulesJson,
            state: sql<"available">`'available'`.as("state"),
            requestedSessionId: sql<null | string>`NULL`.as("requested_session_id"),
            issuanceKey: sql<string>`'rule:' || ${customerCouponRules.id} || ':once'`.as(
              "issuance_key",
            ),
            mutationId: sql<string>`${token}`.as("mutation_id"),
            createdAt: sql<number>`${now}`.as("created_at"),
          })
          .from(customerMemberships)
          .innerJoin(
            customerCouponRules,
            and(eq(customerCouponRules.storeId, storeId), eq(customerCouponRules.active, true)),
          )
          .leftJoin(totals, eq(totals.membershipId, customerMemberships.id))
          .where(
            and(
              eq(customerMemberships.storeId, storeId),
              eq(customerMemberships.active, true),
              inArray(customerMemberships.id, targets),
              eligible,
              gate,
              gt(sql<number>`json_extract(${customerCouponRules.rulesJson},'$.endsAt')`, now),
            ),
          ),
      )
      .onConflictDoNothing(),
    couponEvent(services, storeId, token, "issued", event, "system"),
  ] as const;
}

export function enrolmentCouponStatements(services: ApiServices, storeId: string, userId: string) {
  const targets = services.db
    .select({ membershipId: customerMemberships.id })
    .from(customerMemberships)
    .where(and(eq(customerMemberships.storeId, storeId), eq(customerMemberships.userId, userId)));
  return eligibleCouponStatements(services, storeId, targets, "enrol");
}

export function confirmedVisitCouponStatements(
  services: ApiServices,
  storeId: string,
  sessionId: string,
  gate?: SQL,
) {
  const targets = services.db
    .select({ membershipId: customerPointAllocations.membershipId })
    .from(customerPointAllocations)
    .where(
      and(
        eq(customerPointAllocations.storeId, storeId),
        eq(customerPointAllocations.sessionId, sessionId),
      ),
    )
    .limit(50);
  return eligibleCouponStatements(services, storeId, targets, "visit", gate);
}
