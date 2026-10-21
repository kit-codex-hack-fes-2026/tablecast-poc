import type { z } from "zod";
import { and, eq, exists, sql } from "drizzle-orm";
import type { ApiServices } from "../../../platform/context";
import type { Actor } from "../../auth/model";
import type { CustomerActor } from "../../customers/model";
import type { customerAttributionSchema, customerConsumptionSchema } from "../model";
import { customerConsumption, customerMemberships } from "../../../db/customer-schema";
import { orders } from "../../../db/table-schema";
import { ensure } from "../../../platform/errors";
import { requireCustomerVisit } from "../../customer-visits/queries";
import { requireCustomer } from "../../customers/queries";
import { snapshotSchema } from "../../orders/model";
import { customerServiceTarget } from "../queries";

export async function recordCustomerConsumption(
  services: ApiServices,
  actor: CustomerActor,
  input: z.infer<typeof customerConsumptionSchema>,
) {
  const membership = await requireCustomer(services, actor);
  const order = await services.db
    .select()
    .from(orders)
    .where(and(eq(orders.id, input.orderId), eq(orders.store_id, actor.storeId)))
    .get();
  ensure(order, "ORDER_NOT_FOUND", 404);
  await requireCustomerVisit(services, actor, order.table_session_id);
  const line = snapshotSchema
    .parse(JSON.parse(order.snapshot_json))
    .lines.find((item) => item.id === input.lineId);
  ensure(line && input.quantity <= line.quantity, "CUSTOMER_CONSUMPTION_INVALID", 422);
  const now = Date.now();
  const values = {
    id: crypto.randomUUID(),
    storeId: actor.storeId,
    membershipId: membership.id,
    sessionId: order.table_session_id,
    orderId: order.id,
    lineId: line.id,
    productId: line.productId,
    quantity: input.quantity,
    shared: input.shared,
    createdAt: now,
    updatedAt: now,
  };
  const result =
    input.revision === 0
      ? await services.db
          .insert(customerConsumption)
          .select(
            services.db
              .select({
                id: sql<string>`${values.id}`.as("id"),
                storeId: customerMemberships.storeId,
                membershipId: customerMemberships.id,
                sessionId: sql<string>`${values.sessionId}`.as("session_id"),
                orderId: sql<string>`${values.orderId}`.as("order_id"),
                lineId: sql<string>`${values.lineId}`.as("line_id"),
                productId: sql<string>`${values.productId}`.as("product_id"),
                quantity: sql<number>`${values.quantity}`.as("quantity"),
                shared: sql<boolean>`${values.shared ? 1 : 0}`.as("shared"),
                revision: sql<number>`1`.as("revision"),
                createdAt: sql<number>`${now}`.as("created_at"),
                updatedAt: sql<number>`${now}`.as("updated_at"),
              })
              .from(customerMemberships)
              .where(
                and(
                  eq(customerMemberships.id, membership.id),
                  eq(customerMemberships.active, true),
                ),
              ),
          )
          .onConflictDoNothing()
          .returning({ id: customerConsumption.id })
      : await services.db
          .update(customerConsumption)
          .set({
            quantity: input.quantity,
            shared: input.shared,
            revision: sql`${customerConsumption.revision}+1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(customerConsumption.membershipId, membership.id),
              eq(customerConsumption.storeId, actor.storeId),
              eq(customerConsumption.orderId, order.id),
              eq(customerConsumption.lineId, line.id),
              eq(customerConsumption.revision, input.revision),
              exists(
                services.db
                  .select({ id: customerMemberships.id })
                  .from(customerMemberships)
                  .where(
                    and(
                      eq(customerMemberships.id, membership.id),
                      eq(customerMemberships.active, true),
                    ),
                  ),
              ),
            ),
          )
          .returning({ id: customerConsumption.id });
  ensure(result.length === 1, "CUSTOMER_CONSUMPTION_STALE", 409);
  return { saved: true };
}

export async function attributeCustomerConsumption(
  services: ApiServices,
  actor: Actor,
  input: z.infer<typeof customerAttributionSchema>,
) {
  ensure(actor.kind === "device", "DEVICE_REQUIRED", 403);
  const { participants, session } = await customerServiceTarget(services, actor);
  const target = participants.find((p) => p.participant.id === input.participantId);
  ensure(target, "CUSTOMER_TARGET_REQUIRED", 422);
  const order = await services.db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.id, input.orderId),
        eq(orders.store_id, actor.storeId),
        eq(orders.table_session_id, session.id),
      ),
    )
    .get();
  ensure(order, "ORDER_NOT_FOUND", 404);
  return recordCustomerConsumption(
    services,
    { kind: "customer", storeId: actor.storeId, userId: target.membership.userId },
    input,
  );
}
