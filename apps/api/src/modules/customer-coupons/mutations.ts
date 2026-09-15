import { and, eq, exists, sql } from "drizzle-orm";
import {
  customerCouponEvents,
  customerCoupons,
  payments,
  tableSessions,
} from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import type { Actor } from "../auth/model";
export function couponEvent(
  services: ApiServices,
  storeId: string,
  token: string,
  kind: string,
  reason: string,
  createdBy: string,
) {
  return services.db.insert(customerCouponEvents).select(
    services.db
      .select({
        id: sql<string>`lower(hex(randomblob(16)))`.as("id"),
        storeId: customerCoupons.storeId,
        couponId: customerCoupons.id,
        kind: sql<string>`${kind}`.as("kind"),
        reason: sql<string>`${reason}`.as("reason"),
        createdBy: sql<string>`${createdBy}`.as("created_by"),
        createdAt: sql<number>`${Date.now()}`.as("created_at"),
      })
      .from(customerCoupons)
      .where(and(eq(customerCoupons.storeId, storeId), eq(customerCoupons.mutationId, token))),
  );
}
export function billingGate(services: ApiServices, actor: Actor, token: string) {
  return exists(
    services.db
      .select({ id: tableSessions.id })
      .from(tableSessions)
      .where(
        and(
          eq(tableSessions.id, actor.tableSessionId ?? ""),
          eq(tableSessions.store_id, actor.storeId),
          eq(tableSessions.mutation_id, token),
        ),
      ),
  );
}
export function couponPayment(
  services: ApiServices,
  actor: Actor,
  token: string,
  key: string,
  amount: number,
  reason: string,
) {
  return services.db.insert(payments).select(
    services.db
      .select({
        id: sql<string>`${crypto.randomUUID()}`.as("id"),
        store_id: tableSessions.store_id,
        table_session_id: tableSessions.id,
        idempotency_key: sql<string>`${key}`.as("idempotency_key"),
        kind: sql<"adjustment">`'adjustment'`.as("kind"),
        amount: sql<number>`${amount}`.as("amount"),
        reason: sql<string>`${reason}`.as("reason"),
        actor_id: sql<string>`${actor.userId}`.as("actor_id"),
        created_at: sql<number>`${Date.now()}`.as("created_at"),
      })
      .from(tableSessions)
      .where(
        and(eq(tableSessions.id, actor.tableSessionId ?? ""), billingGate(services, actor, token)),
      ),
  );
}
