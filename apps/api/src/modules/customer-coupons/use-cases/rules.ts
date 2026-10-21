import type { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import { customerCouponRules, customerCoupons } from "../../../db/rewards-schema";
import { ensure } from "../../../platform/errors";
import { requireManager } from "../../auth/policy";
import { requireImageAssets } from "../../media/service";
import { type couponDefinitionSchema } from "../model";
import { couponEvent } from "../mutations";

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
