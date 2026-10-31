import type { z } from "zod";
import { and, eq, exists, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import type { CustomerActor } from "../../customers/model";
import { customerMemberships } from "../../../db/customer-schema";
import { customerCouponRules, customerCoupons } from "../../../db/rewards-schema";
import { ensure } from "../../../platform/errors";
import { requireManager } from "../../auth/policy";
import { pointEntryStatement } from "../../customer-points/mutations";
import { pointBalance } from "../../customer-points/queries";
import { requireCustomer } from "../../customers/queries";
import { couponConditionMatch, couponMemberTotals } from "../conditions";
import { couponRuleSchema, type issueCouponSchema } from "../model";
import { couponEvent } from "../mutations";

async function issueOneCoupon(
  services: ApiServices,
  actor: { storeId: string; userId: string },
  membershipId: string,
  ruleId: string,
  key: string,
  exchange: boolean,
) {
  const findIssuedCoupon = () =>
    services.db
      .select({ id: customerCoupons.id, ruleId: customerCoupons.ruleId })
      .from(customerCoupons)
      .where(
        and(
          eq(customerCoupons.storeId, actor.storeId),
          eq(customerCoupons.membershipId, membershipId),
          eq(customerCoupons.issuanceKey, key),
        ),
      )
      .get();
  const previous = await findIssuedCoupon();
  if (previous) {
    ensure(previous.ruleId === ruleId, "IDEMPOTENCY_CONFLICT", 409);
    return { id: previous.id };
  }
  const rule = await services.db
    .select()
    .from(customerCouponRules)
    .where(
      and(
        eq(customerCouponRules.id, ruleId),
        eq(customerCouponRules.storeId, actor.storeId),
        eq(customerCouponRules.active, true),
      ),
    )
    .get();
  ensure(rule, "COUPON_RULE_NOT_FOUND", 404);
  const rules = couponRuleSchema.parse(JSON.parse(rule.rulesJson));
  const now = Date.now();
  ensure(rules.endsAt > now && (!exchange || rules.startsAt <= now), "COUPON_EXPIRED", 409);
  ensure(rules.trigger === (exchange ? "exchange" : "manual"), "COUPON_ISSUE_TRIGGER", 422);
  const id = `${now.toString().padStart(16, "0")}:${crypto.randomUUID()}`;
  const token = crypto.randomUUID();
  const balance = pointBalance(services, actor.storeId, membershipId);
  const targets = services.db
    .select({ id: customerMemberships.id })
    .from(customerMemberships)
    .where(
      and(eq(customerMemberships.id, membershipId), eq(customerMemberships.storeId, actor.storeId)),
    );
  const totals = couponMemberTotals(services, actor.storeId, targets);
  const eligible = and(
    eq(customerMemberships.id, membershipId),
    eq(customerMemberships.storeId, actor.storeId),
    eq(customerMemberships.active, true),
    exists(
      services.db
        .select({ id: customerCouponRules.id })
        .from(customerCouponRules)
        .where(
          and(
            eq(customerCouponRules.id, ruleId),
            eq(customerCouponRules.storeId, actor.storeId),
            eq(customerCouponRules.version, rule.version),
            eq(customerCouponRules.active, true),
          ),
        ),
    ),
    exchange ? sql`(${balance})>=${rules.threshold}` : undefined,
    couponConditionMatch(services, sql`${rule.rulesJson}`, totals),
  );
  const issued = exists(
    services.db
      .select({ id: customerCoupons.id })
      .from(customerCoupons)
      .where(and(eq(customerCoupons.id, id), eq(customerCoupons.mutationId, token))),
  );
  await services.db.batch([
    services.db
      .insert(customerCoupons)
      .select(
        services.db
          .select({
            id: sql<string>`${id}`.as("id"),
            storeId: customerMemberships.storeId,
            membershipId: customerMemberships.id,
            ruleId: sql<string>`${rule.id}`.as("rule_id"),
            ruleVersion: sql<number>`${rule.version}`.as("rule_version"),
            snapshotJson: sql<string>`${rule.rulesJson}`.as("snapshot_json"),
            state: sql<"available">`'available'`.as("state"),
            requestedSessionId: sql<null | string>`NULL`.as("requested_session_id"),
            issuanceKey: sql<string>`${key}`.as("issuance_key"),
            mutationId: sql<string>`${token}`.as("mutation_id"),
            createdAt: sql<number>`${now}`.as("created_at"),
          })
          .from(customerMemberships)
          .leftJoin(totals, eq(totals.membershipId, customerMemberships.id))
          .where(eligible),
      )
      .onConflictDoNothing(),
    ...(exchange
      ? [
          pointEntryStatement(
            services,
            actor,
            membershipId,
            -rules.threshold,
            "exchange",
            `coupon:${id}`,
            "クーポン交換 / Coupon exchange",
            issued,
          ),
        ]
      : []),
    couponEvent(
      services,
      actor.storeId,
      token,
      "issued",
      exchange ? "exchange" : "manual",
      actor.userId,
    ),
  ]);
  const coupon = await findIssuedCoupon();
  ensure(coupon, "COUPON_EXCHANGE_UNAVAILABLE", 409);
  ensure(coupon.ruleId === ruleId, "IDEMPOTENCY_CONFLICT", 409);
  return { id: coupon.id };
}

export async function exchangeCustomerCoupon(
  services: ApiServices,
  actor: CustomerActor,
  ruleId: string,
  idempotencyKey: string,
) {
  const membership = await requireCustomer(services, actor);
  return issueOneCoupon(services, actor, membership.id, ruleId, `exchange:${idempotencyKey}`, true);
}

export async function issueCustomerCoupon(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof issueCouponSchema>,
) {
  requireManager(actor);
  return issueOneCoupon(
    services,
    { storeId: actor.storeId, userId: actor.userId ?? "mcp" },
    input.membershipId,
    input.ruleId,
    `manual:${input.idempotencyKey}`,
    false,
  );
}
