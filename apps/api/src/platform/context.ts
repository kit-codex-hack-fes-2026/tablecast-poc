import type { BetterAuthOptions } from "better-auth";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import type { Actor } from "../modules/auth/model";
import { createAuth } from "../modules/auth/service";
// Worker bindingと依存の寿命をHTTPリクエストに揃える。業務関数はHonoへ依存しない。
export function createApiServices(
  env: TablecastEnv,
  requestId?: string,
  backgroundTasks?: NonNullable<BetterAuthOptions["advanced"]>["backgroundTasks"],
) {
  const db = drizzle(env.TABLECAST_DB);
  let auth: ReturnType<typeof createAuth> | undefined;
  return {
    env,
    db,
    requestId,
    // health・画像・音声ではBetter Authを初期化しない。
    get auth() {
      return (auth ??= createAuth(env, undefined, db, backgroundTasks));
    },
  };
}
export type ApiServices = ReturnType<typeof createApiServices>;
export type Database = ApiServices["db"];

export const requestServices = createMiddleware<ApiEnv>(async (c, next) => {
  c.set(
    "services",
    createApiServices(c.env, c.get("traceId"), {
      handler: (task) => c.executionCtx.waitUntil(task),
    }),
  );
  await next();
});

export type ApiEnv = {
  Bindings: TablecastEnv;
  Variables: {
    actor: Actor;
    traceId: string;
    errorPhase?: "mcp.authentication" | "mcp.store" | "mcp.registration" | "mcp.transport";
    services: ApiServices;
    session?: ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>;
  };
};
