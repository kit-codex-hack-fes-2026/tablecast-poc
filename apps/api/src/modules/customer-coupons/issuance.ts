import { and, eq, gt, lte, or, sql } from "drizzle-orm";
import {
  customerMemberships,
  customerCouponRules,
  customerCoupons,
  customerPointAllocations,
  customerPointVisits,
} from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { couponEvent } from "./mutations";
export async function issueEligibleCoupons(
  services: ApiServices,
  storeId: string,
  membershipIds: string[],
  event: "enrol" | "visit",
) {
  if (!membershipIds.length) return;
  const { db } = services;
  const token = crypto.randomUUID();
  const now = Date.now();
  const targetIds = sql`${customerMemberships.id} IN (SELECT value FROM json_each(${JSON.stringify(membershipIds)}))`;
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
        sql`${customerPointVisits.confirmedAt} IS NOT NULL`,
      ),
    )
    .where(
      and(
        eq(customerPointAllocations.storeId, storeId),
        sql`${customerPointAllocations.membershipId} IN (SELECT value FROM json_each(${JSON.stringify(membershipIds)}))`,
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
  await db.batch([
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
            requestedSessionId: sql<string | null>`NULL`.as("requested_session_id"),
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
              targetIds,
              eligible,
              gt(sql<number>`json_extract(${customerCouponRules.rulesJson},'$.endsAt')`, now),
            ),
          ),
      )
      .onConflictDoNothing(),
    couponEvent(services, storeId, token, "issued", event, "system"),
  ]);
}

export async function issueConfirmedVisitCoupons(
  services: ApiServices,
  storeId: string,
  sessionId: string,
) {
  const allocations = await services.db
    .select({ membershipId: customerPointAllocations.membershipId })
    .from(customerPointAllocations)
    .where(
      and(
        eq(customerPointAllocations.storeId, storeId),
        eq(customerPointAllocations.sessionId, sessionId),
      ),
    )
    .limit(50);
  await issueEligibleCoupons(
    services,
    storeId,
    allocations.map((row) => row.membershipId),
    "visit",
  );
}
