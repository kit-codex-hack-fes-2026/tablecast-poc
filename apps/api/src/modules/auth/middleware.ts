import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../../platform/context";
import { ensure } from "../../platform/errors";
import type { Actor } from "./model";
import { findDeviceSession, findStoreMembership } from "./queries";
import { hashDeviceToken } from "./service";
export async function deviceActor(c: Context<ApiEnv>): Promise<Actor> {
  const token = getCookie(c, "tablecast.device");
  ensure(token, "DEVICE_REQUIRED", 401);
  const row = await findDeviceSession(c.get("services"), await hashDeviceToken(token));
  ensure(row, "DEVICE_NOT_ASSIGNED", 401);
  return { kind: "device", storeId: row.store_id, tableSessionId: row.id };
}

export async function staffIdentity(c: Context<ApiEnv>) {
  let pending = c.get("session");
  if (!pending) {
    pending = c.get("services").auth.api.getSession({ headers: c.req.raw.headers });
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

export const requireStore = createMiddleware<ApiEnv>(async (c, next) => {
  const storeId = c.req.param("storeId");
  ensure(storeId, "STORE_REQUIRED", 400);
  c.set("actor", await staffActor(c, storeId));
  await next();
});
export const requireDevice = createMiddleware<ApiEnv>(async (c, next) => {
  c.set("actor", await deviceActor(c));
  await next();
});
