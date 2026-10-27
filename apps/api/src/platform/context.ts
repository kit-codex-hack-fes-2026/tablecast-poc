import type { BetterAuthOptions } from "better-auth";
import { createMiddleware } from "hono/factory";
import type { DemoRecord, StoreRecord, TableRecord } from "../db/records";
import type { createIdentity } from "../modules/auth/identity";
import type { Actor } from "../modules/auth/model";
import type { createAuth } from "../modules/auth/service";
import type { PlanUsage } from "../modules/orders/model";
import { createDatabase } from "../db/client";
// Worker bindingと依存の寿命をHTTPリクエストに揃える。業務関数はHonoへ依存しない。
export function createApiServices(
  env: TablecastEnv,
  requestId?: string,
  backgroundTasks?: NonNullable<BetterAuthOptions["advanced"]>["backgroundTasks"],
) {
  const db = createDatabase(env.TABLECAST_DB);
  let auth: Promise<ReturnType<typeof createAuth>> | undefined;
  let identity: Promise<ReturnType<typeof createIdentity>> | undefined;
  // 認可時の行は最初の業務読取だけへ渡し、更新後の状態取得には再利用しない。
  const tableAccess: {
    demo?: {
      configuration: Pick<DemoRecord, "config_json" | "config_version"> & { storeName: string };
      id: string;
      planUsage: null | PlanUsage;
      storeId: string;
      userId?: string;
      voiceSessionId?: string;
    };
    pricing?: {
      planUsage: null | PlanUsage;
      sessionId: string;
      store: Pick<StoreRecord, "config_json" | "config_version" | "id" | "name">;
    };
    session?: TableRecord;
  } = {};
  return {
    env,
    db,
    requestId,
    backgroundTasks,
    tableAccess,
    getAuth() {
      return (auth ??= import("../modules/auth/service").then(({ createAuth }) =>
        createAuth(env, undefined, db, backgroundTasks),
      ));
    },
    getIdentity() {
      return (identity ??= import("../modules/auth/identity").then(({ createIdentity }) =>
        createIdentity(env, db),
      ));
    },
  };
}
export type ApiServices = ReturnType<typeof createApiServices>;

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
    errorPhase?: "mcp.authentication" | "mcp.registration" | "mcp.store" | "mcp.transport";
    services: ApiServices;
    session?: ReturnType<ReturnType<typeof createIdentity>["api"]["getSession"]>;
    staffSession: NonNullable<
      Awaited<ReturnType<ReturnType<typeof createIdentity>["api"]["getSession"]>>
    >;
    traceId: string;
  };
};
