import { and, eq, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import * as business from "../../../db/business-schema";
import { ensure } from "../../../platform/errors";
import { observeOperation } from "../../../platform/telemetry";
import { requireNoAppliedCoupon } from "../../customer-coupons/queries";
import { pointBillingCorrectionStatements } from "../../customer-points/mutations";
import { eventStatement, invalidationStatement, notifyStore } from "../../tables/mutations";
import { getSession, getTableState } from "../../tables/queries";
import { orderValue } from "../../tables/values";
import { type Order } from "../model";

export const orderStatusSchema = z
  .object({ status: createSelectSchema(business.orders).shape.status.exclude(["submitted"]) })
  .strict();

export async function changeOrderStatus(
  services: ApiServices,
  actor: Actor,
  orderId: string,
  status: Order["status"],
): Promise<Order> {
  return observeOperation(
    "tablecast.order.status",
    async () => {
      const db = services.db;

      ensure(actor.kind === "staff", "STAFF_REQUIRED", 403);
      const row = await db
        .select()
        .from(business.orders)
        .where(and(eq(business.orders.id, orderId), eq(business.orders.store_id, actor.storeId)))
        .get();
      ensure(row, "ORDER_NOT_FOUND", 404);
      await getSession(services, { ...actor, tableSessionId: row.table_session_id });
      if (row.status === status) return orderValue(row);
      const transitions: Record<Order["status"], Order["status"][]> = {
        submitted: ["accepted", "rejected", "cancelled"],
        accepted: ["served", "cancelled"],
        served: [],
        cancelled: [],
        rejected: [],
      };
      ensure(transitions[row.status].includes(status), "ORDER_TRANSITION");
      const scoped = { ...actor, tableSessionId: row.table_session_id };
      const table = await getTableState(services, scoped);
      if (status === "cancelled" || status === "rejected") {
        await requireNoAppliedCoupon(services, scoped);
        ensure(table.bill.due >= row.total, "PAYMENT_CORRECTION_REQUIRED");
      }
      const mutation = crypto.randomUUID();
      const now = Date.now();
      const pointCorrections =
        status === "cancelled" || status === "rejected"
          ? await pointBillingCorrectionStatements(
              services,
              scoped,
              -row.total,
              `order:${orderId}:${status}`,
              mutation,
            )
          : [];
      const result = await db.batch([
        db
          .update(business.tableSessions)
          .set({ cart_version: sql`cart_version+1`, mutation_id: mutation })
          .where(
            sql`id=${row.table_session_id} AND store_id=${actor.storeId} AND cart_version=${table.cart.version} AND status='open' AND EXISTS(SELECT 1 FROM orders WHERE id=${orderId} AND status=${row.status})`,
          ),
        db
          .update(business.orders)
          .set({ status: status, updated_at: now })
          .where(
            sql`id=${orderId} AND EXISTS(SELECT 1 FROM table_sessions WHERE id=${row.table_session_id} AND mutation_id=${mutation})`,
          ),
        ...pointCorrections,
        invalidationStatement(services, scoped, mutation),
        eventStatement(services, scoped, mutation, "order.status", { orderId, status }),
      ]);
      ensure(result[0]?.meta.changes === 1, "ORDER_CONFLICT");
      await notifyStore(services, actor.storeId, scoped.tableSessionId, {
        cursor: result.at(-1)?.meta.last_row_id ?? 0,
        demoId: table.kind === "demo" ? table.id : undefined,
      });
      return { ...orderValue(row), status };
    },
    { env: services.env, input: { actor, orderId, status } },
  );
}
