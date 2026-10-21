import type { z } from "zod";
import { and, eq, exists, isNull, notExists, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import { customerMemberships, customerVisitParticipants } from "../../../db/customer-schema";
import { customerCoupons, customerCouponUses } from "../../../db/rewards-schema";
import { tableSessions } from "../../../db/table-schema";
import { ensure } from "../../../platform/errors";
import { pointBillingCorrectionStatements } from "../../customer-points/billing-correction";
import {
  eventStatement,
  invalidationStatement,
  mutationGate,
  notifyStore,
} from "../../tables/mutations";
import { getTableState } from "../../tables/queries";
import { type applyCouponSchema, couponRuleSchema } from "../model";
import { couponEvent, couponPayment } from "../mutations";

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
  const gate = mutationGate(services, actor, token);
  const corrections = await pointBillingCorrectionStatements(
    services,
    actor,
    -discount,
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
          cancelledAt: sql<null | number>`NULL`.as("cancelled_at"),
          cancelKey: sql<null | string>`NULL`.as("cancel_key"),
          cancelReason: sql<null | string>`NULL`.as("cancel_reason"),
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
  await notifyStore(services, actor.storeId, table.id, {
    cursor: result.at(-1)?.meta.last_row_id ?? 0,
    demoId: table.kind === "demo" ? table.id : undefined,
  });
  return { useId };
}
