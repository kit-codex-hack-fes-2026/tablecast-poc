import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import type { ApiEnv } from "../../platform/context";
import type { Actor } from "./model";
import { ensure } from "../../platform/errors";
import { apiFactory } from "../../platform/http";
import { findDeviceSession, findStoreMembership } from "./queries";
import { hashDeviceToken } from "./token";
async function deviceActor(c: Context<ApiEnv>): Promise<Actor> {
  const token = getCookie(c, "tablecast.device");
  ensure(token, "DEVICE_REQUIRED", 401);
  const row = await findDeviceSession(c.get("services"), await hashDeviceToken(token));
  ensure(row, "DEVICE_NOT_ASSIGNED", 401);
  return { kind: "device", storeId: row.store_id, tableSessionId: row.id, deviceId: row.deviceId };
}

export async function staffIdentity<E extends ApiEnv>(c: Context<E>) {
  let pending: ApiEnv["Variables"]["session"] = c.get("session");
  if (!pending) {
    const services: ApiEnv["Variables"]["services"] = c.get("services");
    pending = services.auth.api.getSession({ headers: c.req.raw.headers });
    c.set("session", pending);
  }
  const session = await pending;
  ensure(session, "LOGIN_REQUIRED", 401);
  return session;
}

export async function staffActor(
  c: Context<ApiEnv>,
  storeId: string,
  admin = false,
): Promise<Actor> {
  const session = await staffIdentity(c);
  const membership = await findStoreMembership(c.get("services"), session.user.id, storeId);
  ensure(membership, "STORE_FORBIDDEN", 403);
  if (admin) ensure(["owner", "admin"].includes(membership.role), "ADMIN_REQUIRED", 403);
  return { kind: "staff", storeId, userId: session.user.id, role: membership.role };
}

const actorGuard = (resolve: (c: Context<ApiEnv>) => Actor | Promise<Actor>) =>
  apiFactory.createMiddleware(async (c, next) => {
    c.set("actor", await resolve(c));
    await next();
  });

export const requireIdentity = apiFactory.createMiddleware(async (c, next) => {
  c.set("staffSession", await staffIdentity(c));
  await next();
});

export const tableScope = actorGuard((c) => ({
  ...c.get("actor"),
  tableSessionId: c.req.param("id"),
}));

export const requireStore = actorGuard(async (c) => {
  const storeId = c.req.param("storeId");
  ensure(storeId, "STORE_REQUIRED", 400);
  return staffActor(c, storeId);
});
export const requireDevice = actorGuard(deviceActor);
