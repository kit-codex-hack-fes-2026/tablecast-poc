import { isAPIError } from "better-auth/api";
import { and, desc, eq } from "drizzle-orm";
import { user } from "../../db/auth-schema";
import * as business from "../../db/business-schema";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "../auth/model";
import { requireManager } from "../auth/policy";
import { hashDeviceToken } from "../auth/service";
export async function redeemDevice(services: ApiServices, deviceCode: string) {
  const { db } = services;
  let result;
  try {
    result = await services.auth.api.tablecastRedeemDevice({
      body: { deviceCode: deviceCode },
    });
  } catch (error) {
    if (
      isAPIError(error) &&
      ["authorization_pending", "slow_down"].includes(String(error.body?.error))
    )
      return { ready: false } as const;
    throw error;
  }
  const mapping = await db
    .select()
    .from(business.deviceAssignments)
    .where(
      and(
        eq(business.deviceAssignments.user_code, result.userCode),
        eq(business.deviceAssignments.approved_by, result.userId),
      ),
    )
    .get();
  ensure(mapping, "DEVICE_NOT_ASSIGNED", 403);
  const token = crypto.randomUUID() + crypto.randomUUID();
  await db.insert(business.devices).values({
    id: crypto.randomUUID(),
    token_hash: await hashDeviceToken(token),
    store_id: mapping.store_id,
    table_id: mapping.table_id,
    approved_by: mapping.approved_by,
    created_at: Date.now(),
  });
  return { ready: true, token } as const;
}

export async function approveDevice(
  services: ApiServices,
  actor: Actor,
  headers: Headers,
  input: { userCode: string; tableId: string },
) {
  requireManager(actor);
  ensure(actor.userId, "LOGIN_REQUIRED", 401);
  const { db } = services;
  const auth = services.auth;
  const target = await db
    .select({ id: business.restaurantTables.id })
    .from(business.restaurantTables)
    .where(
      and(
        eq(business.restaurantTables.id, input.tableId),
        eq(business.restaurantTables.store_id, actor.storeId),
      ),
    )
    .get();
  ensure(target, "TABLE_NOT_FOUND", 404);
  await auth.api.deviceVerify({
    query: { user_code: input.userCode },
    headers: headers,
  });
  await db.insert(business.deviceAssignments).values({
    user_code: input.userCode,
    store_id: actor.storeId,
    table_id: input.tableId,
    approved_by: actor.userId,
    created_at: Date.now(),
  });
  await auth.api.deviceApprove({
    body: { userCode: input.userCode },
    headers: headers,
  });
  return { approved: true };
}
export async function revokeDevice(services: ApiServices, actor: Actor, id: string) {
  requireManager(actor);
  await services.db
    .update(business.devices)
    .set({ revoked_at: Date.now() })
    .where(and(eq(business.devices.id, id), eq(business.devices.store_id, actor.storeId)));
  return { revoked: true };
}

export async function listDevices(services: ApiServices, actor: Actor) {
  requireManager(actor);
  const { db } = services;
  const [devices, tables] = await db.batch([
    db
      .select({
        id: business.devices.id,
        tableId: business.devices.table_id,
        tableName: business.restaurantTables.name,
        createdAt: business.devices.created_at,
        revokedAt: business.devices.revoked_at,
        approvedByName: user.name,
        approvedByEmail: user.email,
        approvedByImage: user.image,
      })
      .from(business.devices)
      .innerJoin(
        business.restaurantTables,
        and(
          eq(business.restaurantTables.id, business.devices.table_id),
          eq(business.restaurantTables.store_id, business.devices.store_id),
        ),
      )
      .innerJoin(user, eq(user.id, business.devices.approved_by))
      .where(eq(business.devices.store_id, actor.storeId))
      .orderBy(desc(business.devices.created_at)),
    db
      .select({ id: business.restaurantTables.id, name: business.restaurantTables.name })
      .from(business.restaurantTables)
      .where(eq(business.restaurantTables.store_id, actor.storeId))
      .orderBy(business.restaurantTables.name),
  ]);
  return { devices, tables };
}
