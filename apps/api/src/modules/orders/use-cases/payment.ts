import { and, eq, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { observeOperation } from "../../../platform/telemetry";
import { confirmedVisitCouponStatements } from "../../customer-coupons/issuance";
import { requireNoAppliedCoupon } from "../../customer-coupons/queries";
import { pointBillingCorrectionStatements } from "../../customer-points/billing-correction";
import {
  eventStatement,
  invalidationStatement,
  mutationGate,
  notifyStore,
} from "../../tables/mutations";
import { getTableState } from "../../tables/queries";

export async function recordPayment(
  services: ApiServices,
  actor: Actor,
  input: { amount: number; idempotencyKey: string; kind: "adjustment" | "payment"; reason: string },
) {
  return observeOperation(
    "tablecast.payment.record",
    async () => {
      const db = services.db;

      ensure(actor.kind === "staff" && actor.userId, "STAFF_REQUIRED", 403);
      const existing = await db
        .select({
          amount: business.payments.amount,
          kind: business.payments.kind,
          reason: business.payments.reason,
        })
        .from(business.payments)
        .where(
          and(
            eq(business.payments.table_session_id, actor.tableSessionId ?? sql`null`),
            eq(business.payments.idempotency_key, input.idempotencyKey),
          ),
        )
        .get();
      if (existing) {
        ensure(
          existing.amount === input.amount &&
            existing.kind === input.kind &&
            existing.reason === input.reason,
          "IDEMPOTENCY_CONFLICT",
        );
        await db.batch(
          confirmedVisitCouponStatements(services, actor.storeId, actor.tableSessionId ?? ""),
        );
        return getTableState(services, actor);
      }
      const table = await getTableState(services, actor);
      if (input.kind === "adjustment") await requireNoAppliedCoupon(services, actor);
      if (input.kind === "payment")
        ensure(
          input.amount > 0
            ? input.amount <= table.bill.due
            : table.bill.paidTotal + input.amount >= 0,
          "PAYMENT_AMOUNT",
          422,
        );
      else ensure(table.bill.due + input.amount >= 0, "ADJUSTMENT_AMOUNT", 422);
      const mutation = crypto.randomUUID();
      const pointCorrections =
        input.kind === "adjustment"
          ? await pointBillingCorrectionStatements(
              services,
              actor,
              input.amount,
              `adjustment:${input.idempotencyKey}`,
              mutation,
            )
          : [];
      const result = await db.batch([
        db
          .update(business.tableSessions)
          .set({ cart_version: sql`cart_version+1`, mutation_id: mutation })
          .where(
            sql`id=${actor.tableSessionId} AND store_id=${actor.storeId} AND cart_version=${table.cart.version} AND status=${table.status}`,
          ),
        db
          .insert(business.payments)
          .select(
            sql`SELECT ${crypto.randomUUID()},store_id,id,${input.idempotencyKey},${input.kind},${input.amount},${input.reason},${actor.userId},${Date.now()} FROM table_sessions WHERE id=${actor.tableSessionId} AND mutation_id=${mutation}`,
          ),
        ...pointCorrections,
        ...confirmedVisitCouponStatements(
          services,
          actor.storeId,
          table.id,
          mutationGate(services, actor, mutation),
        ),
        invalidationStatement(services, actor, mutation),
        eventStatement(services, actor, mutation, `billing.${input.kind}`, {
          amount: input.amount,
          reason: input.reason,
        }),
      ]);
      if (result[0]?.meta.changes !== 1) {
        const retry = await db
          .select({
            amount: business.payments.amount,
            kind: business.payments.kind,
            reason: business.payments.reason,
          })
          .from(business.payments)
          .where(
            and(
              eq(business.payments.table_session_id, actor.tableSessionId ?? sql`null`),
              eq(business.payments.idempotency_key, input.idempotencyKey),
            ),
          )
          .get();
        ensure(
          retry &&
            retry.amount === input.amount &&
            retry.kind === input.kind &&
            retry.reason === input.reason,
          "BILLING_CONFLICT",
        );
        await db.batch(confirmedVisitCouponStatements(services, actor.storeId, table.id));
      }
      await notifyStore(services, actor.storeId, actor.tableSessionId);
      return getTableState(services, actor);
    },
    { env: services.env, input: { actor, input } },
  );
}
