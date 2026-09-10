import { isAPIError } from "better-auth/api";
import { sql } from "drizzle-orm";
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
  const mapping = await db.get<
    { store_id: string; table_id: string; approved_by: string } | undefined
  >(
    sql`SELECT * FROM device_assignments WHERE user_code=${result.userCode} AND approved_by=${result.userId}`,
  );
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
  const target = await db.get<Record<string, unknown> | undefined>(
    sql`SELECT id FROM restaurant_tables WHERE id=${input.tableId} AND store_id=${actor.storeId}`,
  );
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
    .where(sql`id=${id} AND store_id=${actor.storeId}`);
  return { revoked: true };
}

export async function listDevices(services: ApiServices, actor: Actor) {
  requireManager(actor);
  const { db } = services;
  const devices = await db.all<{
    id: string;
    tableId: string;
    tableName: string;
    createdAt: number;
    revokedAt: number | null;
    approvedByName: string;
    approvedByEmail: string;
    approvedByImage: string | null;
  }>(
    sql`SELECT d.id,d.table_id AS tableId,t.name AS tableName,d.created_at AS createdAt,d.revoked_at AS revokedAt,u.name AS approvedByName,u.email AS approvedByEmail,u.image AS approvedByImage FROM devices d JOIN restaurant_tables t ON t.id=d.table_id AND t.store_id=d.store_id JOIN user u ON u.id=d.approved_by WHERE d.store_id=${actor.storeId} ORDER BY d.created_at DESC`,
  );
  const tables = await db.all<{ id: string; name: string }>(
    sql`SELECT id,name FROM restaurant_tables WHERE store_id=${actor.storeId} ORDER BY name`,
  );
  return { devices, tables };
}
