import { and, desc, eq } from "drizzle-orm";
import { customerMemberships, stores } from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { CustomerActor } from "./model";

export async function getCustomerStore(services: ApiServices, actor: CustomerActor) {
  const row = await services.db
    .select({
      store: { id: stores.id, name: stores.name },
      membership: customerMemberships,
    })
    .from(stores)
    .leftJoin(
      customerMemberships,
      and(eq(customerMemberships.storeId, stores.id), eq(customerMemberships.userId, actor.userId)),
    )
    .where(eq(stores.id, actor.storeId))
    .get();
  ensure(row, "STORE_NOT_FOUND", 404);
  return row;
}

export async function requireCustomer(services: ApiServices, actor: CustomerActor) {
  const membership = await services.db
    .select()
    .from(customerMemberships)
    .where(
      and(
        eq(customerMemberships.storeId, actor.storeId),
        eq(customerMemberships.userId, actor.userId),
        eq(customerMemberships.active, true),
      ),
    )
    .get();
  ensure(membership, "CUSTOMER_MEMBERSHIP_REQUIRED", 403);
  return membership;
}

export async function listCustomerMemberships(services: ApiServices, userId: string) {
  return services.db
    .select({
      id: customerMemberships.id,
      storeId: stores.id,
      name: stores.name,
      joinedAt: customerMemberships.joinedAt,
    })
    .from(customerMemberships)
    .innerJoin(stores, eq(stores.id, customerMemberships.storeId))
    .where(and(eq(customerMemberships.userId, userId), eq(customerMemberships.active, true)))
    .orderBy(desc(customerMemberships.joinedAt))
    .limit(100);
}
