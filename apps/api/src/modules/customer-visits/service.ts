import { and, eq, exists, isNull, sql } from "drizzle-orm";
import {
  customerMemberships,
  customerVisitCodes,
  customerVisitParticipants,
  devices,
  tableEvents,
  tableSessions,
} from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { hashDeviceToken } from "../auth/service";
import { getCustomerStore } from "../customers/queries";
import type { CustomerActor } from "../customers/model";
import { notifyStore } from "../tables/mutations";
import { getCustomerVisit, requireCustomerVisit, validVisitCode } from "./queries";

export async function createCustomerVisitCode(services: ApiServices, actor: Actor) {
  ensure(
    actor.kind === "device" && actor.deviceId && actor.tableSessionId && !actor.demoId,
    "DEVICE_REQUIRED",
    403,
  );
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const code = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  const tokenHash = await hashDeviceToken(code);
  const expiresAt = Date.now() + 5 * 60_000;
  const { db } = services;
  const source = db
    .select({
      deviceId: devices.id,
      storeId: devices.store_id,
      sessionId: tableSessions.id,
      tokenHash: sql<string>`${tokenHash}`.as("token_hash"),
      expiresAt: sql<number>`${expiresAt}`.as("expires_at"),
    })
    .from(devices)
    .innerJoin(
      tableSessions,
      and(
        eq(tableSessions.table_id, devices.table_id),
        eq(tableSessions.store_id, devices.store_id),
      ),
    )
    .where(
      and(
        eq(devices.id, actor.deviceId),
        eq(devices.store_id, actor.storeId),
        isNull(devices.revoked_at),
        eq(tableSessions.id, actor.tableSessionId),
        eq(tableSessions.status, "open"),
        eq(tableSessions.kind, "table"),
      ),
    );
  const rows = await db
    .insert(customerVisitCodes)
    .select(source)
    .onConflictDoUpdate({
      target: customerVisitCodes.deviceId,
      set: { storeId: actor.storeId, sessionId: actor.tableSessionId, tokenHash, expiresAt },
    })
    .returning({ sessionId: customerVisitCodes.sessionId });
  ensure(rows.length === 1, "SESSION_CLOSED", 409);
  return {
    code,
    expiresAt,
    url: `${services.env.TABLECAST_PUBLIC_ORIGIN}/member/join?code=${code}`,
  };
}

export async function resolveCustomerVisit(services: ApiServices, userId: string, code: string) {
  const visit = await validVisitCode(services, await hashDeviceToken(code)).get();
  ensure(visit, "CUSTOMER_VISIT_CODE_EXPIRED", 409);
  const store = await getCustomerStore(services, {
    kind: "customer",
    userId,
    storeId: visit.storeId,
  });
  return { ...visit, membership: store.membership };
}

export async function joinCustomerVisit(services: ApiServices, userId: string, code: string) {
  const tokenHash = await hashDeviceToken(code);
  const visit = await validVisitCode(services, tokenHash).get();
  ensure(visit, "CUSTOMER_VISIT_CODE_EXPIRED", 409);
  const { db } = services;
  const valid = validVisitCode(services, tokenHash).as("valid_visit");
  const now = Date.now();
  const source = db
    .select({
      id: sql<string>`${crypto.randomUUID()}`.as("id"),
      storeId: customerMemberships.storeId,
      sessionId: valid.sessionId,
      membershipId: customerMemberships.id,
      joinedAt: sql<number>`${now}`.as("joined_at"),
      leftAt: sql<number | null>`NULL`.as("left_at"),
    })
    .from(customerMemberships)
    .innerJoin(valid, eq(valid.storeId, customerMemberships.storeId))
    .where(and(eq(customerMemberships.userId, userId), eq(customerMemberships.active, true)));
  await db.batch([
    db
      .insert(customerVisitParticipants)
      .select(source)
      .onConflictDoUpdate({
        target: [customerVisitParticipants.sessionId, customerVisitParticipants.membershipId],
        set: { leftAt: null },
        setWhere: sql`${customerVisitParticipants.leftAt} IS NOT NULL`,
      }),
    db.insert(tableEvents).select(
      db
        .select({
          cursor: sql<number>`NULL`.as("cursor"),
          store_id: tableSessions.store_id,
          table_session_id: tableSessions.id,
          kind: sql<string>`'customer.changed'`.as("kind"),
          data_json: sql<string>`'{}'`.as("data_json"),
          created_at: sql<number>`${now}`.as("created_at"),
        })
        .from(tableSessions)
        .where(
          and(
            eq(tableSessions.id, visit.sessionId),
            eq(tableSessions.store_id, visit.storeId),
            sql`changes()=1`,
          ),
        ),
    ),
  ]);
  const actor = { kind: "customer", userId, storeId: visit.storeId } as const;
  const result = await getCustomerVisit(services, actor, visit.sessionId);
  await notifyStore(services, visit.storeId, visit.sessionId);
  return result;
}

export async function leaveCustomerVisit(
  services: ApiServices,
  actor: CustomerActor,
  sessionId: string,
) {
  const visit = await requireCustomerVisit(services, actor, sessionId);
  const now = Date.now();
  await services.db.batch([
    services.db
      .update(customerVisitParticipants)
      .set({ leftAt: now })
      .where(
        and(
          eq(customerVisitParticipants.id, visit.participation.id),
          eq(customerVisitParticipants.storeId, actor.storeId),
          isNull(customerVisitParticipants.leftAt),
          exists(
            services.db
              .select({ id: customerMemberships.id })
              .from(customerMemberships)
              .where(
                and(
                  eq(customerMemberships.id, visit.membership.id),
                  eq(customerMemberships.active, true),
                ),
              ),
          ),
        ),
      ),
    services.db.insert(tableEvents).select(
      services.db
        .select({
          cursor: sql<number>`NULL`.as("cursor"),
          store_id: tableSessions.store_id,
          table_session_id: tableSessions.id,
          kind: sql<string>`'customer.changed'`.as("kind"),
          data_json: sql<string>`'{}'`.as("data_json"),
          created_at: sql<number>`${now}`.as("created_at"),
        })
        .from(tableSessions)
        .where(
          and(
            eq(tableSessions.id, sessionId),
            eq(tableSessions.store_id, actor.storeId),
            sql`changes()=1`,
          ),
        ),
    ),
  ]);
  await notifyStore(services, actor.storeId, sessionId);
  return getCustomerVisit(services, actor, sessionId);
}
