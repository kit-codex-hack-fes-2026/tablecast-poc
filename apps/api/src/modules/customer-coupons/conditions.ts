import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  notExists,
  or,
  sql,
  type SQLWrapper,
} from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import { customerMemberships } from "../../db/customer-schema";
import { customerPointAllocations, customerPointVisits } from "../../db/rewards-schema";

/** 確認済み来店だけを集計し、発行と対象プレビューで同じ正本を使う。 */
export function couponMemberTotals(services: ApiServices, storeId: string, targets?: SQLWrapper) {
  return services.db
    .select({
      membershipId: sql<string>`${customerPointAllocations.membershipId}`.as(
        "reward_membership_id",
      ),
      visits: sql<number>`count(*)`.as("reward_visits"),
      amount: sql<number>`sum(${customerPointAllocations.amount})`.as("reward_amount"),
      lastVisitAt: sql<number>`max(${customerPointVisits.confirmedAt})`.as("reward_last_visit"),
    })
    .from(customerPointAllocations)
    .innerJoin(
      customerPointVisits,
      and(
        eq(customerPointVisits.sessionId, customerPointAllocations.sessionId),
        eq(customerPointVisits.storeId, storeId),
        isNotNull(customerPointVisits.confirmedAt),
      ),
    )
    .where(
      and(
        eq(customerPointAllocations.storeId, storeId),
        targets ? inArray(customerPointAllocations.membershipId, targets) : undefined,
      ),
    )
    .groupBy(customerPointAllocations.membershipId)
    .as("reward_totals");
}

export function couponConditionMatch(
  services: ApiServices,
  rulesJson: SQLWrapper,
  totals: ReturnType<typeof couponMemberTotals>,
) {
  const match = (value: SQLWrapper) => {
    const actual = sql<number>`CASE json_extract(${value}, '$.field')
      WHEN 'visits' THEN coalesce(${totals.visits},0)
      WHEN 'spend' THEN coalesce(${totals.amount},0)
      WHEN 'joinedAt' THEN ${customerMemberships.joinedAt}
      WHEN 'lastVisitAt' THEN coalesce(${totals.lastVisitAt},0) END`;
    return or(
      and(
        sql`json_extract(${value}, '$.operator')='gte'`,
        sql`${actual}>=json_extract(${value}, '$.value')`,
      ),
      and(
        sql`json_extract(${value}, '$.operator')='lte'`,
        sql`${actual}<=json_extract(${value}, '$.value')`,
      ),
    );
  };
  // DrizzleにJSON配列のtable-valued functionのschemaはないため、FROMのjson_eachだけSQLで表す。
  const all = services.db
    .select({ value: sql`1` })
    .from(sql`json_each(${rulesJson}, '$.conditions.all') AS coupon_all`)
    .where(sql`NOT coalesce(${match(sql`coupon_all.value`)},0)`);
  const any = services.db
    .select({ value: sql`1` })
    .from(sql`json_each(${rulesJson}, '$.conditions.any') AS coupon_any`)
    .where(match(sql`coupon_any.value`));
  return and(
    notExists(all),
    or(sql`coalesce(json_array_length(${rulesJson}, '$.conditions.any'),0)=0`, exists(any)),
  );
}

export function couponAutomaticTrigger(
  rulesJson: SQLWrapper,
  totals: ReturnType<typeof couponMemberTotals>,
  createdAt: SQLWrapper,
  event?: "enrol" | "visit",
) {
  const trigger = sql<string>`json_extract(${rulesJson},'$.trigger')`;
  const threshold = sql<number>`json_extract(${rulesJson},'$.threshold')`;
  return or(
    event !== "visit"
      ? and(eq(trigger, "enrol"), sql`${createdAt}<=${customerMemberships.joinedAt}`)
      : undefined,
    event !== "enrol"
      ? and(eq(trigger, "visits"), sql`coalesce(${totals.visits},0)>=${threshold}`)
      : undefined,
    event !== "enrol"
      ? and(eq(trigger, "spend"), sql`coalesce(${totals.amount},0)>=${threshold}`)
      : undefined,
  );
}
