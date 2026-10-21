import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { ApiEnv } from "../../platform/context";
import type { CustomerActor } from "./model";
import { ensure } from "../../platform/errors";
import { staffIdentity } from "../auth/middleware";

export type CustomerEnv = ApiEnv & { Variables: { customerUserId: string } };

// 会員APIの認証を入力検証より先に行い、スタッフ所属とは分離する。
export const requireCustomerIdentity = createMiddleware<CustomerEnv>(async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  const session = await staffIdentity(c);
  c.set("customerUserId", session.user.id);
  await next();
});

export function customerActor(c: Context<CustomerEnv>): CustomerActor {
  const storeId = c.req.param("storeId");
  ensure(storeId, "STORE_REQUIRED", 400);
  return { kind: "customer", storeId, userId: c.get("customerUserId") };
}
