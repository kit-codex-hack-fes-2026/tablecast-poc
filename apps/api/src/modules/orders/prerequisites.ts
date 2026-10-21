import type { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { TableRecord } from "../../db/records";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
import type { submitSchema } from "./model";
import * as business from "../../db/business-schema";
import { catalogQuery } from "../catalog/queries";

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
  const plan = db
    .select()
    .from(business.orders)
    .where(
      and(
        eq(business.orders.table_session_id, session.id),
        eq(business.orders.store_id, actor.storeId),
      ),
    );
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
  if (session.plan_json && actor.kind === "voice") return db.batch([...base, plan, turn]);
  if (session.plan_json) return [...(await db.batch([...base, plan])), []] as const;
  if (actor.kind === "voice") {
    const [orders, confirmations, coupons, catalogs, turns] = await db.batch([...base, turn]);
    return [orders, confirmations, coupons, catalogs, [], turns] as const;
  }
  return [...(await db.batch(base)), [], []] as const;
}
