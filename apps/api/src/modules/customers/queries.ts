import { and, desc, eq, lt, or } from "drizzle-orm";
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

export async function listCustomerMemberships(
  services: ApiServices,
  userId: string,
  query: { beforeJoinedAt?: number; beforeId?: string; limit: number } = { limit: 100 },
) {
  const rows = await services.db
    .select({
      id: customerMemberships.id,
      storeId: stores.id,
      name: stores.name,
      joinedAt: customerMemberships.joinedAt,
    })
    .from(customerMemberships)
    .innerJoin(stores, eq(stores.id, customerMemberships.storeId))
    .where(
      and(
        eq(customerMemberships.userId, userId),
        eq(customerMemberships.active, true),
        query.beforeJoinedAt !== undefined && query.beforeId
          ? or(
              lt(customerMemberships.joinedAt, query.beforeJoinedAt),
              and(
                eq(customerMemberships.joinedAt, query.beforeJoinedAt),
                lt(customerMemberships.id, query.beforeId),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(customerMemberships.joinedAt), desc(customerMemberships.id))
    .limit(query.limit + 1);
  const memberships = rows.slice(0, query.limit);
  const last = memberships.at(-1);
  return {
    memberships,
    nextCursor:
      rows.length > query.limit && last
        ? { beforeJoinedAt: String(last.joinedAt), beforeId: last.id }
        : null,
  };
}
