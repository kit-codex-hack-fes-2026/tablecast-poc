import { and, asc, desc, eq, gt, isNull, like, lt, sql } from "drizzle-orm";
import { user } from "../../db/auth-schema";
import {
  customerCouponRules,
  customerCoupons,
  customerCouponUses,
  customerMemberships,
} from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import type { CustomerActor } from "../customers/model";
import { requireCustomer } from "../customers/queries";
import { getSession } from "../tables/queries";
import { couponRuleSchema } from "./model";
export async function listCouponRules(
  services: ApiServices,
  actor: Actor,
  query: { beforeId?: string; limit: number },
) {
  ensure(actor.kind === "staff" || actor.kind === "mcp", "STAFF_REQUIRED", 403);
  const rows = await services.db
    .select()
    .from(customerCouponRules)
    .where(
      and(
        eq(customerCouponRules.storeId, actor.storeId),
        query.beforeId ? lt(customerCouponRules.id, query.beforeId) : undefined,
      ),
    )
    .orderBy(desc(customerCouponRules.id))
    .limit(query.limit + 1);
  const rules = rows.slice(0, query.limit).map((row) => ({
    id: row.id,
    version: row.version,
    active: row.active,
    rules: couponRuleSchema.parse(JSON.parse(row.rulesJson)),
  }));
  return { rules, nextCursor: rows.length > query.limit ? (rules.at(-1)?.id ?? null) : null };
}
export async function listRewardMembers(
  services: ApiServices,
  actor: Actor,
  query: { beforeId?: string; limit: number; query: string },
) {
  ensure(actor.kind === "staff" || actor.kind === "mcp", "STAFF_REQUIRED", 403);
  const rows = await services.db
    .select({ id: customerMemberships.id, name: user.name, joinedAt: customerMemberships.joinedAt })
    .from(customerMemberships)
    .innerJoin(user, eq(user.id, customerMemberships.userId))
    .where(
      and(
        eq(customerMemberships.storeId, actor.storeId),
        eq(customerMemberships.active, true),
        query.query ? like(user.name, `%${query.query}%`) : undefined,
        query.beforeId ? lt(customerMemberships.id, query.beforeId) : undefined,
      ),
    )
    .orderBy(desc(customerMemberships.id))
    .limit(query.limit + 1);
  const members = rows.slice(0, query.limit);
  return { members, nextCursor: rows.length > query.limit ? (members.at(-1)?.id ?? null) : null };
}
export async function listCustomerCoupons(
  services: ApiServices,
  actor: CustomerActor,
  query: { beforeId?: string; limit: number },
) {
  const membership = await requireCustomer(services, actor);
  const rows = await services.db
    .select()
    .from(customerCoupons)
    .where(
      and(
        eq(customerCoupons.storeId, actor.storeId),
        eq(customerCoupons.membershipId, membership.id),
        query.beforeId ? lt(customerCoupons.id, query.beforeId) : undefined,
      ),
    )
    .orderBy(desc(customerCoupons.id))
    .limit(query.limit + 1);
  const now = Date.now();
  const coupons = rows.slice(0, query.limit).map((row) => {
    const rules = couponRuleSchema.parse(JSON.parse(row.snapshotJson));
    return {
      id: row.id,
      state: row.state,
      requestedSessionId: row.requestedSessionId,
      issuedAt: row.createdAt,
      rules,
      inDate: rules.startsAt <= now && now < rules.endsAt,
    };
  });
  return { coupons, nextCursor: rows.length > query.limit ? (coupons.at(-1)?.id ?? null) : null };
}
export async function listCouponExchanges(
  services: ApiServices,
  actor: CustomerActor,
  query: { beforeId?: string; limit: number },
) {
  await requireCustomer(services, actor);
  const rows = await services.db
    .select()
    .from(customerCouponRules)
    .where(
      and(
        eq(customerCouponRules.storeId, actor.storeId),
        eq(customerCouponRules.active, true),
        sql`json_extract(${customerCouponRules.rulesJson},'$.trigger')='exchange'`,
        sql`json_extract(${customerCouponRules.rulesJson},'$.startsAt')<=${Date.now()}`,
        gt(sql`json_extract(${customerCouponRules.rulesJson},'$.endsAt')`, Date.now()),
        query.beforeId ? lt(customerCouponRules.id, query.beforeId) : undefined,
      ),
    )
    .orderBy(desc(customerCouponRules.id))
    .limit(query.limit + 1);
  const rules = rows
    .slice(0, query.limit)
    .map((row) => ({ id: row.id, rules: couponRuleSchema.parse(JSON.parse(row.rulesJson)) }));
  return { rules, nextCursor: rows.length > query.limit ? (rules.at(-1)?.id ?? null) : null };
}
export async function getVisitCoupons(services: ApiServices, actor: Actor) {
  ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
  const session = await getSession(services, actor);
  const [requested, uses] = await services.db.batch([
    services.db
      .select({ id: customerCoupons.id, name: user.name, snapshot: customerCoupons.snapshotJson })
      .from(customerCoupons)
      .innerJoin(customerMemberships, eq(customerMemberships.id, customerCoupons.membershipId))
      .innerJoin(user, eq(user.id, customerMemberships.userId))
      .where(
        and(
          eq(customerCoupons.storeId, actor.storeId),
          eq(customerCoupons.requestedSessionId, session.id),
          eq(customerCoupons.state, "requested"),
        ),
      )
      .orderBy(asc(customerCoupons.createdAt)),
    services.db
      .select({
        id: customerCouponUses.id,
        couponId: customerCouponUses.couponId,
        discount: customerCouponUses.discount,
        createdAt: customerCouponUses.createdAt,
      })
      .from(customerCouponUses)
      .where(
        and(
          eq(customerCouponUses.storeId, actor.storeId),
          eq(customerCouponUses.sessionId, session.id),
          isNull(customerCouponUses.cancelledAt),
        ),
      ),
  ]);
  return {
    expectedVersion: session.cart_version,
    requested: requested.map((row) => ({
      id: row.id,
      name: row.name,
      rules: couponRuleSchema.parse(JSON.parse(row.snapshot)),
    })),
    uses,
  };
}

export async function requireNoAppliedCoupon(services: ApiServices, actor: Actor) {
  const applied = await services.db
    .select({ id: customerCouponUses.id })
    .from(customerCouponUses)
    .where(
      and(
        eq(customerCouponUses.storeId, actor.storeId),
        eq(customerCouponUses.sessionId, actor.tableSessionId ?? ""),
        isNull(customerCouponUses.cancelledAt),
      ),
    )
    .get();
  ensure(!applied, "COUPON_CANCEL_REQUIRED", 409);
}
export async function listIssuedCoupons(
  services: ApiServices,
  actor: Actor,
  query: { beforeId?: string; limit: number },
) {
  ensure(actor.kind === "staff" || actor.kind === "mcp", "STAFF_REQUIRED", 403);
  const rows = await services.db
    .select({
      id: customerCoupons.id,
      name: user.name,
      state: customerCoupons.state,
      snapshot: customerCoupons.snapshotJson,
      issuedAt: customerCoupons.createdAt,
    })
    .from(customerCoupons)
    .innerJoin(customerMemberships, eq(customerMemberships.id, customerCoupons.membershipId))
    .innerJoin(user, eq(user.id, customerMemberships.userId))
    .where(
      and(
        eq(customerCoupons.storeId, actor.storeId),
        query.beforeId ? lt(customerCoupons.id, query.beforeId) : undefined,
      ),
    )
    .orderBy(desc(customerCoupons.id))
    .limit(query.limit + 1);
  const coupons = rows.slice(0, query.limit).map(({ snapshot, ...row }) => ({
    ...row,
    rules: couponRuleSchema.parse(JSON.parse(snapshot)),
  }));
  return { coupons, nextCursor: rows.length > query.limit ? (coupons.at(-1)?.id ?? null) : null };
}
