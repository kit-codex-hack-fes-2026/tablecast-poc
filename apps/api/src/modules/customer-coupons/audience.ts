import type { z } from "zod";
import { and, eq, exists, gt, or, sql } from "drizzle-orm";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { couponAudienceSchema } from "./model";
import { customerMemberships } from "../../db/customer-schema";
import {
  customerCouponRules,
  customerCoupons,
  customerPointEntries,
} from "../../db/rewards-schema";
import { ensure } from "../../platform/errors";
import { requireManagerRead } from "../auth/policy";
import { couponAutomaticTrigger, couponConditionMatch, couponMemberTotals } from "./conditions";

/** 発券しない対象確認。発行済み券や個人記憶を列挙せず、同じ判定の集計だけを返す。 */
export async function previewCouponAudience(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof couponAudienceSchema>,
) {
  requireManagerRead(actor);
  const now = Date.now();
  const rule = input.ruleId
    ? await services.db
        .select({ createdAt: customerCouponRules.createdAt })
        .from(customerCouponRules)
        .where(
          and(
            eq(customerCouponRules.id, input.ruleId),
            eq(customerCouponRules.storeId, actor.storeId),
          ),
        )
        .get()
    : undefined;
  ensure(!input.ruleId || rule, "COUPON_RULE_NOT_FOUND", 404);
  const rulesJson = sql`${JSON.stringify(input.rules)}`;
  const totals = couponMemberTotals(services, actor.storeId);
  const balance = services.db
    .select({ balance: sql<number>`coalesce(sum(${customerPointEntries.delta}),0)` })
    .from(customerPointEntries)
    .where(
      and(
        eq(customerPointEntries.storeId, actor.storeId),
        eq(customerPointEntries.membershipId, customerMemberships.id),
      ),
    );
  const trigger = or(
    couponAutomaticTrigger(rulesJson, totals, sql`${rule?.createdAt ?? now}`),
    sql`json_extract(${rulesJson},'$.trigger')='manual'`,
    and(
      sql`json_extract(${rulesJson},'$.trigger')='exchange'`,
      sql`${input.rules.startsAt}<=${now}`,
      sql`(${balance})>=${input.rules.threshold}`,
    ),
  );
  const matched = and(
    trigger,
    couponConditionMatch(services, rulesJson, totals),
    gt(sql`${input.rules.endsAt}`, now),
  );
  const once = ["enrol", "visits", "spend"].includes(input.rules.trigger);
  const issued =
    input.ruleId && once
      ? exists(
          services.db
            .select({ id: customerCoupons.id })
            .from(customerCoupons)
            .where(
              and(
                eq(customerCoupons.storeId, actor.storeId),
                eq(customerCoupons.membershipId, customerMemberships.id),
                eq(customerCoupons.issuanceKey, `rule:${input.ruleId}:once`),
              ),
            ),
        )
      : sql`0`;
  const row = await services.db
    .select({
      totalMembers: sql<number>`count(*)`.mapWith(Number),
      eligible:
        sql<number>`coalesce(sum(CASE WHEN ${matched} AND NOT ${issued} THEN 1 ELSE 0 END),0)`.mapWith(
          Number,
        ),
      alreadyIssued:
        sql<number>`coalesce(sum(CASE WHEN ${matched} AND ${issued} THEN 1 ELSE 0 END),0)`.mapWith(
          Number,
        ),
      notMatching: sql<number>`coalesce(sum(CASE WHEN NOT ${matched} THEN 1 ELSE 0 END),0)`.mapWith(
        Number,
      ),
    })
    .from(customerMemberships)
    .leftJoin(totals, eq(totals.membershipId, customerMemberships.id))
    .where(
      and(eq(customerMemberships.storeId, actor.storeId), eq(customerMemberships.active, true)),
    )
    .get();
  ensure(row, "COUPON_AUDIENCE_UNAVAILABLE", 503);
  return {
    ...row,
    evaluatedAt: now,
    issuance:
      input.rules.trigger === "manual"
        ? ("manual" as const)
        : input.rules.trigger === "exchange"
          ? ("exchange" as const)
          : ("automatic" as const),
  };
}
