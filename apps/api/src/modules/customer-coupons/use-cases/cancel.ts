import type { z } from "zod";
import { and, eq, exists, isNull, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
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
import { confirmedVisitCouponStatements } from "../issuance";
import { type cancelCouponUseSchema } from "../model";
import { couponEvent, couponPayment } from "../mutations";

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
    await services.db.batch(confirmedVisitCouponStatements(services, actor.storeId, use.sessionId));
    return { cancelled: true };
  }
  const table = await getTableState(services, actor);
  const token = crypto.randomUUID();
  const now = Date.now();
  const gate = mutationGate(services, actor, token);
  const corrections = await pointBillingCorrectionStatements(
    services,
    actor,
    use.discount,
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
    ...confirmedVisitCouponStatements(services, actor.storeId, table.id, gate),
    couponEvent(services, actor.storeId, token, "use-cancelled", input.reason, actor.userId),
    invalidationStatement(services, actor, token),
    eventStatement(services, actor, token, "coupon.cancelled", {}),
  ]);
  if (result[0].meta.changes !== 1) {
    const committed = await services.db
      .select()
      .from(customerCouponUses)
      .where(
        and(
          eq(customerCouponUses.id, use.id),
          eq(customerCouponUses.storeId, actor.storeId),
          eq(customerCouponUses.sessionId, table.id),
        ),
      )
      .get();
    ensure(
      committed?.cancelledAt !== null &&
        committed?.cancelKey === input.idempotencyKey &&
        committed?.cancelReason === input.reason,
      "COUPON_CANCEL_CONFLICT",
      409,
    );
    await services.db.batch(confirmedVisitCouponStatements(services, actor.storeId, table.id));
  }
  await notifyStore(services, actor.storeId, table.id, {
    cursor: result.at(-1)?.meta.last_row_id ?? 0,
    demoId: table.kind === "demo" ? table.id : undefined,
  });
  return { cancelled: true };
}
