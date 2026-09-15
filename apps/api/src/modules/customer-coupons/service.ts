import { issueConfirmedVisitCoupons } from "./issuance";
import { couponEvent, couponPayment, billingGate } from "./mutations";
import { and, eq, exists, inArray, isNull, notExists, sql } from "drizzle-orm";
import type { z } from "zod";
import {
  customerCouponRules,
  customerCoupons,
  customerCouponUses,
  customerMemberships,
  customerVisitParticipants,
  tableSessions,
} from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { requireManager } from "../auth/policy";
import type { CustomerActor } from "../customers/model";
import { requireCustomer } from "../customers/queries";
import { requireCustomerVisit } from "../customer-visits/queries";
import { requireImageAssets } from "../media/service";
import { pointBalance } from "../customer-points/queries";
import { pointBillingCorrectionStatements, pointEntryStatement } from "../customer-points/service";
import { eventStatement, invalidationStatement, notifyStore } from "../tables/mutations";
import { getTableState } from "../tables/queries";
import {
  couponRuleSchema,
  type applyCouponSchema,
  type cancelCouponUseSchema,
  type couponDefinitionSchema,
  type issueCouponSchema,
} from "./model";
export async function saveCouponRule(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof couponDefinitionSchema>,
) {
  requireManager(actor);
  await requireImageAssets(services, actor, [{ ...input.rules, verifySource: true }]);
  const now = Date.now();
  const rows =
    input.expectedVersion === 0
      ? await services.db
          .insert(customerCouponRules)
          .values({
            id: input.id,
            storeId: actor.storeId,
            version: 1,
            active: input.active,
            rulesJson: JSON.stringify(input.rules),
            createdAt: now,
            updatedAt: now,
            createdBy: actor.userId ?? "mcp",
          })
          .onConflictDoNothing()
          .returning({ id: customerCouponRules.id })
      : await services.db
          .update(customerCouponRules)
          .set({
            version: input.expectedVersion + 1,
            active: input.active,
            rulesJson: JSON.stringify(input.rules),
            updatedAt: now,
          })
          .where(
            and(
              eq(customerCouponRules.id, input.id),
              eq(customerCouponRules.storeId, actor.storeId),
              eq(customerCouponRules.version, input.expectedVersion),
            ),
          )
          .returning({ id: customerCouponRules.id });
  ensure(rows.length === 1, "COUPON_RULE_STALE", 409);
  return { id: input.id, version: input.expectedVersion + 1 };
}
async function issueOneCoupon(
  services: ApiServices,
  actor: { storeId: string; userId: string },
  membershipId: string,
  ruleId: string,
  key: string,
  exchange: boolean,
) {
  const previous = await services.db
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
            requestedSessionId: sql<string | null>`NULL`.as("requested_session_id"),
            issuanceKey: sql<string>`${key}`.as("issuance_key"),
            mutationId: sql<string>`${token}`.as("mutation_id"),
            createdAt: sql<number>`${now}`.as("created_at"),
          })
          .from(customerMemberships)
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
  const coupon = await services.db
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
export async function requestCustomerCoupon(
  services: ApiServices,
  actor: CustomerActor,
  couponId: string,
  sessionId: string,
) {
  const visit = await requireCustomerVisit(services, actor, sessionId);
  ensure(
    visit.session.status === "open" && visit.participation.leftAt === null,
    "CUSTOMER_NOT_CONNECTED",
    409,
  );
  const token = crypto.randomUUID();
  const now = Date.now();
  const rows = await services.db.batch([
    services.db
      .update(customerCoupons)
      .set({ state: "requested", requestedSessionId: sessionId, mutationId: token })
      .where(
        and(
          eq(customerCoupons.id, couponId),
          eq(customerCoupons.storeId, actor.storeId),
          eq(customerCoupons.membershipId, visit.membership.id),
          exists(
            services.db
              .select({ id: customerVisitParticipants.id })
              .from(customerVisitParticipants)
              .where(
                and(
                  eq(customerVisitParticipants.membershipId, visit.membership.id),
                  eq(customerVisitParticipants.sessionId, sessionId),
                  isNull(customerVisitParticipants.leftAt),
                ),
              ),
          ),
          inArray(customerCoupons.state, ["available", "requested"]),
          sql`json_extract(${customerCoupons.snapshotJson},'$.startsAt')<=${now}`,
          sql`json_extract(${customerCoupons.snapshotJson},'$.endsAt')>${now}`,
          exists(
            services.db
              .select({ id: tableSessions.id })
              .from(tableSessions)
              .where(and(eq(tableSessions.id, sessionId), eq(tableSessions.status, "open"))),
          ),
          exists(
            services.db
              .select({ id: customerMemberships.id })
              .from(customerMemberships)
              .where(
                and(
                  eq(customerMemberships.id, visit.membership.id),
                  eq(customerMemberships.active, true),
                ),
              ),
          ),
        ),
      )
      .returning({ id: customerCoupons.id }),
    couponEvent(services, actor.storeId, token, "requested", "", actor.userId),
  ]);
  ensure(rows[0].length === 1, "COUPON_UNAVAILABLE", 409);
  return { requested: true };
}
export async function revokeCustomerCoupon(
  services: ApiServices,
  actor: Actor,
  couponId: string,
  reason: string,
) {
  requireManager(actor);
  const token = crypto.randomUUID();
  const result = await services.db.batch([
    services.db
      .update(customerCoupons)
      .set({ state: "revoked", requestedSessionId: null, mutationId: token })
      .where(
        and(
          eq(customerCoupons.id, couponId),
          eq(customerCoupons.storeId, actor.storeId),
          inArray(customerCoupons.state, ["available", "requested"]),
        ),
      ),
    couponEvent(services, actor.storeId, token, "revoked", reason, actor.userId ?? "mcp"),
  ]);
  if (!result[0].meta.changes) {
    const row = await services.db
      .select({ state: customerCoupons.state })
      .from(customerCoupons)
      .where(and(eq(customerCoupons.id, couponId), eq(customerCoupons.storeId, actor.storeId)))
      .get();
    ensure(row?.state === "revoked", "COUPON_UNAVAILABLE", 409);
  }
  return { revoked: true };
}
export async function applyCustomerCoupon(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof applyCouponSchema>,
) {
  ensure(actor.kind === "staff" && actor.userId, "STAFF_REQUIRED", 403);
  const existing = await services.db
    .select()
    .from(customerCouponUses)
    .where(
      and(
        eq(customerCouponUses.storeId, actor.storeId),
        eq(customerCouponUses.idempotencyKey, input.idempotencyKey),
      ),
    )
    .get();
  if (existing) {
    ensure(
      existing.couponId === input.couponId && existing.sessionId === actor.tableSessionId,
      "IDEMPOTENCY_CONFLICT",
      409,
    );
    return { useId: existing.id };
  }
  const table = await getTableState(services, actor);
  ensure(table.status === "open", "SESSION_CLOSED", 409);
  const coupon = await services.db
    .select()
    .from(customerCoupons)
    .where(
      and(
        eq(customerCoupons.id, input.couponId),
        eq(customerCoupons.storeId, actor.storeId),
        eq(customerCoupons.requestedSessionId, table.id),
        eq(customerCoupons.state, "requested"),
      ),
    )
    .get();
  ensure(coupon, "COUPON_NOT_REQUESTED", 409);
  const rules = couponRuleSchema.parse(JSON.parse(coupon.snapshotJson));
  const now = Date.now();
  ensure(rules.startsAt <= now && now < rules.endsAt, "COUPON_EXPIRED", 409);
  const total = table.bill.orderedTotal + table.bill.adjustmentTotal + table.bill.planTotal;
  ensure(total >= rules.minimumYen, "COUPON_MINIMUM_AMOUNT", 422);
  const discount = Math.min(
    total,
    rules.discountKind === "fixed"
      ? rules.discountValue
      : Math.min(Math.floor((total * rules.discountValue) / 100), rules.maximumYen),
  );
  ensure(discount > 0 && discount <= table.bill.due, "COUPON_DISCOUNT_AMOUNT", 422);
  const token = crypto.randomUUID();
  const useId = crypto.randomUUID();
  const gate = billingGate(services, actor, token);
  const corrections = await pointBillingCorrectionStatements(
    services,
    actor,
    total - discount,
    `coupon:${useId}`,
    token,
  );
  const result = await services.db.batch([
    services.db
      .update(customerCoupons)
      .set({ state: "used", mutationId: token })
      .where(
        and(
          eq(customerCoupons.id, coupon.id),
          eq(customerCoupons.storeId, actor.storeId),
          eq(customerCoupons.state, "requested"),
          eq(customerCoupons.requestedSessionId, table.id),
          exists(
            services.db
              .select({ id: tableSessions.id })
              .from(tableSessions)
              .where(
                and(
                  eq(tableSessions.id, table.id),
                  eq(tableSessions.store_id, actor.storeId),
                  eq(tableSessions.status, "open"),
                  eq(tableSessions.cart_version, input.expectedVersion),
                ),
              ),
          ),
          exists(
            services.db
              .select({ id: customerMemberships.id })
              .from(customerMemberships)
              .innerJoin(
                customerVisitParticipants,
                and(
                  eq(customerVisitParticipants.membershipId, customerMemberships.id),
                  eq(customerVisitParticipants.sessionId, table.id),
                  isNull(customerVisitParticipants.leftAt),
                ),
              )
              .where(
                and(
                  eq(customerMemberships.id, coupon.membershipId),
                  eq(customerMemberships.storeId, actor.storeId),
                  eq(customerMemberships.active, true),
                ),
              ),
          ),
          notExists(
            services.db
              .select({ id: customerCouponUses.id })
              .from(customerCouponUses)
              .where(
                and(
                  eq(customerCouponUses.sessionId, table.id),
                  isNull(customerCouponUses.cancelledAt),
                ),
              ),
          ),
        ),
      ),
    services.db
      .update(tableSessions)
      .set({ cart_version: sql`${tableSessions.cart_version}+1`, mutation_id: token })
      .where(
        and(
          eq(tableSessions.id, table.id),
          eq(tableSessions.store_id, actor.storeId),
          exists(
            services.db
              .select({ id: customerCoupons.id })
              .from(customerCoupons)
              .where(and(eq(customerCoupons.id, coupon.id), eq(customerCoupons.mutationId, token))),
          ),
        ),
      ),
    services.db.insert(customerCouponUses).select(
      services.db
        .select({
          id: sql<string>`${useId}`.as("id"),
          storeId: tableSessions.store_id,
          couponId: sql<string>`${coupon.id}`.as("coupon_id"),
          sessionId: tableSessions.id,
          discount: sql<number>`${discount}`.as("discount"),
          idempotencyKey: sql<string>`${input.idempotencyKey}`.as("idempotency_key"),
          createdBy: sql<string>`${actor.userId}`.as("created_by"),
          createdAt: sql<number>`${now}`.as("created_at"),
          cancelledAt: sql<number | null>`NULL`.as("cancelled_at"),
          cancelKey: sql<string | null>`NULL`.as("cancel_key"),
          cancelReason: sql<string | null>`NULL`.as("cancel_reason"),
        })
        .from(tableSessions)
        .where(and(eq(tableSessions.id, table.id), gate)),
    ),
    couponPayment(
      services,
      actor,
      token,
      `coupon:${useId}`,
      -discount,
      `クーポン / Coupon: ${rules.title[table.locale]}`,
    ),
    ...corrections,
    couponEvent(services, actor.storeId, token, "applied", useId, actor.userId),
    invalidationStatement(services, actor, token),
    eventStatement(services, actor, token, "coupon.applied", {}),
  ]);
  if (result[0].meta.changes !== 1) {
    const used = await services.db
      .select({ id: customerCouponUses.id })
      .from(customerCouponUses)
      .where(
        and(
          eq(customerCouponUses.storeId, actor.storeId),
          eq(customerCouponUses.idempotencyKey, input.idempotencyKey),
          eq(customerCouponUses.couponId, input.couponId),
          eq(customerCouponUses.sessionId, actor.tableSessionId ?? ""),
        ),
      )
      .get();
    ensure(used, "COUPON_APPLY_CONFLICT", 409);
    return { useId: used.id };
  }
  await notifyStore(services, actor.storeId, table.id);
  return { useId };
}
export async function cancelCustomerCouponUse(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof cancelCouponUseSchema>,
) {
  ensure(actor.kind === "staff" && actor.userId, "STAFF_REQUIRED", 403);
  const use = await services.db
    .select()
    .from(customerCouponUses)
    .where(
      and(
        eq(customerCouponUses.id, input.useId),
        eq(customerCouponUses.storeId, actor.storeId),
        eq(customerCouponUses.sessionId, actor.tableSessionId ?? ""),
      ),
    )
    .get();
  ensure(use, "COUPON_USE_NOT_FOUND", 404);
  if (use.cancelledAt !== null) {
    ensure(
      use.cancelKey === input.idempotencyKey && use.cancelReason === input.reason,
      "IDEMPOTENCY_CONFLICT",
      409,
    );
    await issueConfirmedVisitCoupons(services, actor.storeId, use.sessionId);
    return { cancelled: true };
  }
  const table = await getTableState(services, actor);
  const token = crypto.randomUUID();
  const now = Date.now();
  const gate = billingGate(services, actor, token);
  const corrections = await pointBillingCorrectionStatements(
    services,
    actor,
    table.bill.orderedTotal + table.bill.adjustmentTotal + table.bill.planTotal + use.discount,
    `coupon-cancel:${use.id}`,
    token,
  );
  const result = await services.db.batch([
    services.db
      .update(customerCouponUses)
      .set({ cancelledAt: now, cancelKey: input.idempotencyKey, cancelReason: input.reason })
      .where(
        and(
          eq(customerCouponUses.id, use.id),
          eq(customerCouponUses.storeId, actor.storeId),
          isNull(customerCouponUses.cancelledAt),
          exists(
            services.db
              .select({ id: tableSessions.id })
              .from(tableSessions)
              .where(
                and(
                  eq(tableSessions.id, table.id),
                  eq(tableSessions.cart_version, input.expectedVersion),
                ),
              ),
          ),
        ),
      ),
    services.db
      .update(tableSessions)
      .set({ cart_version: sql`${tableSessions.cart_version}+1`, mutation_id: token })
      .where(
        and(
          eq(tableSessions.id, table.id),
          eq(tableSessions.store_id, actor.storeId),
          sql`changes()=1`,
        ),
      ),
    services.db
      .update(customerCoupons)
      .set({ state: "available", requestedSessionId: null, mutationId: token })
      .where(
        and(eq(customerCoupons.id, use.couponId), eq(customerCoupons.storeId, actor.storeId), gate),
      ),
    couponPayment(services, actor, token, `coupon-cancel:${use.id}`, use.discount, input.reason),
    ...corrections,
    couponEvent(services, actor.storeId, token, "use-cancelled", input.reason, actor.userId),
    invalidationStatement(services, actor, token),
    eventStatement(services, actor, token, "coupon.cancelled", {}),
  ]);
  ensure(result[0].meta.changes === 1, "COUPON_CANCEL_CONFLICT", 409);
  await issueConfirmedVisitCoupons(services, actor.storeId, table.id);
  await notifyStore(services, actor.storeId, table.id);
  return { cancelled: true };
}
