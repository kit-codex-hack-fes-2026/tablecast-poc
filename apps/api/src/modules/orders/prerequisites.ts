import type { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { TableRecord } from "../../db/records";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { submitSchema } from "./model";
import * as business from "../../db/business-schema";
import { catalogQuery } from "../catalog/queries";
import { pointBillingCorrectionQueries } from "../customer-points/queries";
import { planUsageQuery } from "./queries";

export async function orderPrerequisites(
  services: ApiServices,
  actor: Actor,
  session: TableRecord,
  input: Pick<z.infer<typeof submitSchema>, "idempotencyKey" | "snapshotId">,
) {
  const { db } = services;
  const base = [
    db
      .select()
      .from(business.orders)
      .where(
        and(
          eq(business.orders.table_session_id, session.id),
          eq(business.orders.store_id, actor.storeId),
          eq(business.orders.idempotency_key, input.idempotencyKey),
        ),
      ),
    db
      .select()
      .from(business.confirmations)
      .where(
        and(
          eq(business.confirmations.id, input.snapshotId),
          eq(business.confirmations.store_id, actor.storeId),
          eq(business.confirmations.table_session_id, session.id),
        ),
      ),
    db
      .select({ id: business.customerCouponUses.id })
      .from(business.customerCouponUses)
      .where(
        and(
          eq(business.customerCouponUses.storeId, actor.storeId),
          eq(business.customerCouponUses.sessionId, session.id),
          isNull(business.customerCouponUses.cancelledAt),
        ),
      )
      .limit(1),
    catalogQuery(db, actor.storeId, session.kind === "demo" ? session.id : undefined),
  ] as const;
  const plan = planUsageQuery(db, session.id, actor.storeId);
  const turn = db
    .select({ started_at: business.voiceTurns.started_at })
    .from(business.voiceTurns)
    .where(
      and(
        eq(business.voiceTurns.id, actor.turnId ?? sql`null`),
        eq(business.voiceTurns.voice_session_id, actor.voiceSessionId ?? sql`null`),
        eq(business.voiceTurns.store_id, actor.storeId),
        eq(business.voiceTurns.table_session_id, session.id),
      ),
    )
    .limit(1);
  const points = pointBillingCorrectionQueries(services, actor);
  if (session.plan_json && actor.kind === "voice")
    return db.batch([...base, plan, turn, ...points]);
  if (session.plan_json) {
    const [orders, confirmations, coupons, catalogs, planOrders, visits, allocations] =
      await db.batch([...base, plan, ...points]);
    return [orders, confirmations, coupons, catalogs, planOrders, [], visits, allocations] as const;
  }
  if (actor.kind === "voice") {
    const [orders, confirmations, coupons, catalogs, turns, visits, allocations] = await db.batch([
      ...base,
      turn,
      ...points,
    ]);
    return [orders, confirmations, coupons, catalogs, [], turns, visits, allocations] as const;
  }
  const [orders, confirmations, coupons, catalogs, visits, allocations] = await db.batch([
    ...base,
    ...points,
  ]);
  return [orders, confirmations, coupons, catalogs, [], [], visits, allocations] as const;
}
