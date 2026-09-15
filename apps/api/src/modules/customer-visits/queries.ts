import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { user } from "../../db/auth-schema";
import {
  customerMemberships,
  customerVisitCodes,
  customerVisitParticipants,
  devices,
  orders,
  restaurantTables,
  stores,
  tableSessions,
} from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import type { CustomerActor } from "../customers/model";
import { requireCustomer } from "../customers/queries";
import { snapshotSchema } from "../orders/model";

export function validVisitCode(services: ApiServices, tokenHash: string) {
  return services.db
    .select({
      storeId: sql<string>`${stores.id}`.as("visit_code_store_id"),
      storeName: sql<string>`${stores.name}`.as("store_name"),
      sessionId: sql<string>`${tableSessions.id}`.as("visit_code_session_id"),
      tableName: sql<string>`${restaurantTables.name}`.as("table_name"),
      expiresAt: customerVisitCodes.expiresAt,
    })
    .from(customerVisitCodes)
    .innerJoin(
      devices,
      and(
        eq(devices.id, customerVisitCodes.deviceId),
        eq(devices.store_id, customerVisitCodes.storeId),
        isNull(devices.revoked_at),
      ),
    )
    .innerJoin(
      tableSessions,
      and(
        eq(tableSessions.id, customerVisitCodes.sessionId),
        eq(tableSessions.store_id, customerVisitCodes.storeId),
        eq(tableSessions.table_id, devices.table_id),
        eq(tableSessions.status, "open"),
        eq(tableSessions.kind, "table"),
      ),
    )
    .innerJoin(stores, eq(stores.id, tableSessions.store_id))
    .innerJoin(restaurantTables, eq(restaurantTables.id, tableSessions.table_id))
    .where(
      and(
        eq(customerVisitCodes.tokenHash, tokenHash),
        gt(customerVisitCodes.expiresAt, Date.now()),
      ),
    );
}

export function listVisitParticipants(
  services: ApiServices,
  storeId: string,
  sessionIds: string[],
  activeOnly: boolean,
) {
  return services.db
    .select({
      sessionId: customerVisitParticipants.sessionId,
      id: customerVisitParticipants.id,
      name: sql<
        string | null
      >`CASE WHEN ${customerMemberships.active} AND ${customerMemberships.shareCompanions} THEN ${user.name} ELSE NULL END`,
      joinedAt: customerVisitParticipants.joinedAt,
      leftAt: customerVisitParticipants.leftAt,
    })
    .from(customerVisitParticipants)
    .innerJoin(
      customerMemberships,
      and(
        eq(customerMemberships.id, customerVisitParticipants.membershipId),
        eq(customerMemberships.storeId, storeId),
      ),
    )
    .innerJoin(user, eq(user.id, customerMemberships.userId))
    .where(
      and(
        eq(customerVisitParticipants.storeId, storeId),
        inArray(customerVisitParticipants.sessionId, sessionIds),
        activeOnly
          ? and(isNull(customerVisitParticipants.leftAt), eq(customerMemberships.active, true))
          : undefined,
      ),
    )
    .orderBy(asc(customerVisitParticipants.joinedAt), asc(customerVisitParticipants.id));
}

export async function getDeviceParticipants(services: ApiServices, actor: Actor) {
  ensure(
    actor.kind === "device" && actor.deviceId && actor.tableSessionId && !actor.demoId,
    "DEVICE_REQUIRED",
    403,
  );
  const current = await services.db
    .select({ id: tableSessions.id })
    .from(tableSessions)
    .innerJoin(
      devices,
      and(
        eq(devices.id, actor.deviceId),
        eq(devices.table_id, tableSessions.table_id),
        eq(devices.store_id, actor.storeId),
        isNull(devices.revoked_at),
      ),
    )
    .where(
      and(
        eq(tableSessions.id, actor.tableSessionId),
        eq(tableSessions.store_id, actor.storeId),
        eq(tableSessions.status, "open"),
      ),
    )
    .get();
  ensure(current, "SESSION_CLOSED", 409);
  return {
    sessionId: current.id,
    participants: await listVisitParticipants(services, actor.storeId, [current.id], true),
  };
}

export async function requireCustomerVisit(
  services: ApiServices,
  actor: CustomerActor,
  sessionId: string,
) {
  const membership = await requireCustomer(services, actor);
  const visit = await services.db
    .select({
      participation: customerVisitParticipants,
      session: tableSessions,
      tableName: restaurantTables.name,
      storeName: stores.name,
    })
    .from(customerVisitParticipants)
    .innerJoin(
      tableSessions,
      and(
        eq(tableSessions.id, customerVisitParticipants.sessionId),
        eq(tableSessions.store_id, actor.storeId),
      ),
    )
    .innerJoin(stores, eq(stores.id, tableSessions.store_id))
    .innerJoin(restaurantTables, eq(restaurantTables.id, tableSessions.table_id))
    .where(
      and(
        eq(customerVisitParticipants.storeId, actor.storeId),
        eq(customerVisitParticipants.membershipId, membership.id),
        eq(customerVisitParticipants.sessionId, sessionId),
      ),
    )
    .get();
  ensure(visit, "CUSTOMER_VISIT_NOT_FOUND", 404);
  return { membership, ...visit };
}

export async function getCustomerVisit(
  services: ApiServices,
  actor: CustomerActor,
  sessionId: string,
) {
  const visit = await requireCustomerVisit(services, actor, sessionId);
  const [participants, orderPage] = await Promise.all([
    listVisitParticipants(services, actor.storeId, [sessionId], false),
    customerOrderPage(services, actor.storeId, sessionId, { limit: 20 }),
  ]);
  return {
    storeId: actor.storeId,
    storeName: visit.storeName,
    tableName: visit.tableName,
    sessionId,
    status: visit.session.status,
    openedAt: visit.session.opened_at,
    closedAt: visit.session.closed_at,
    participantId: visit.participation.id,
    connected: visit.session.status === "open" && visit.participation.leftAt === null,
    participants,
    ...orderPage,
  };
}

export async function listCustomerVisits(
  services: ApiServices,
  actor: CustomerActor,
  query: { beforeJoinedAt?: number; beforeId?: string; limit: number },
) {
  const membership = await requireCustomer(services, actor);
  const rows = await services.db
    .select({
      sessionId: tableSessions.id,
      tableName: restaurantTables.name,
      status: tableSessions.status,
      openedAt: tableSessions.opened_at,
      closedAt: tableSessions.closed_at,
      participantId: customerVisitParticipants.id,
      joinedAt: customerVisitParticipants.joinedAt,
      leftAt: customerVisitParticipants.leftAt,
    })
    .from(customerVisitParticipants)
    .innerJoin(
      tableSessions,
      and(
        eq(tableSessions.id, customerVisitParticipants.sessionId),
        eq(tableSessions.store_id, actor.storeId),
      ),
    )
    .innerJoin(restaurantTables, eq(restaurantTables.id, tableSessions.table_id))
    .where(
      and(
        eq(customerVisitParticipants.membershipId, membership.id),
        eq(customerVisitParticipants.storeId, actor.storeId),
        query.beforeJoinedAt !== undefined && query.beforeId
          ? or(
              lt(customerVisitParticipants.joinedAt, query.beforeJoinedAt),
              and(
                eq(customerVisitParticipants.joinedAt, query.beforeJoinedAt),
                lt(customerVisitParticipants.id, query.beforeId),
              ),
            )
          : undefined,
      ),
    )
    .orderBy(desc(customerVisitParticipants.joinedAt), desc(customerVisitParticipants.id))
    .limit(query.limit + 1);
  const visits = rows.slice(0, query.limit);
  const last = visits.at(-1);
  const participants = await listVisitParticipants(
    services,
    actor.storeId,
    visits.map((visit) => visit.sessionId),
    false,
  );
  const companions = new Map<string, typeof participants>();
  for (const participant of participants) {
    const group = companions.get(participant.sessionId) ?? [];
    group.push(participant);
    companions.set(participant.sessionId, group);
  }
  return {
    visits: visits.map((visit) => ({
      ...visit,
      participants: companions.get(visit.sessionId) ?? [],
    })),
    nextCursor:
      rows.length > query.limit && last
        ? { beforeJoinedAt: String(last.joinedAt), beforeId: last.participantId }
        : null,
  };
}

async function customerOrderPage(
  services: ApiServices,
  storeId: string,
  sessionId: string,
  query: { beforeId?: string; limit: number },
) {
  const rows = await services.db
    .select({ id: orders.id, status: orders.status, snapshot: orders.snapshot_json })
    .from(orders)
    .where(
      and(
        eq(orders.store_id, storeId),
        eq(orders.table_session_id, sessionId),
        query.beforeId ? lt(orders.id, query.beforeId) : undefined,
      ),
    )
    .orderBy(desc(orders.id))
    .limit(query.limit + 1);
  const page = rows.slice(0, query.limit);
  return {
    orders: page.map((order) => ({
      id: order.id,
      status: order.status,
      snapshot: snapshotSchema.parse(JSON.parse(order.snapshot)),
    })),
    nextOrderId: rows.length > query.limit ? (page.at(-1)?.id ?? null) : null,
  };
}
export async function listCustomerOrders(
  services: ApiServices,
  actor: CustomerActor,
  sessionId: string,
  query: { beforeId?: string; limit: number },
) {
  await requireCustomerVisit(services, actor, sessionId);
  return customerOrderPage(services, actor.storeId, sessionId, query);
}
