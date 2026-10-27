import type { BetterAuthOptions } from "better-auth";
import { createMiddleware } from "hono/factory";
import type { TableRecord } from "../db/records";
import type { Actor } from "../modules/auth/model";
import { createDatabase } from "../db/client";
import { createAuth } from "../modules/auth/service";
// Worker bindingと依存の寿命をHTTPリクエストに揃える。業務関数はHonoへ依存しない。
export function createApiServices(
  env: TablecastEnv,
  requestId?: string,
  backgroundTasks?: NonNullable<BetterAuthOptions["advanced"]>["backgroundTasks"],
) {
  const db = createDatabase(env.TABLECAST_DB);
  let auth: ReturnType<typeof createAuth> | undefined;
  // 認可時の行は最初の業務読取だけへ渡し、更新後の状態取得には再利用しない。
  const tableAccess: {
    demo?: { id: string; storeId: string; userId?: string; voiceSessionId?: string };
    session?: TableRecord;
  } = {};
  return {
    env,
    db,
    requestId,
    backgroundTasks,
    tableAccess,
    // health・画像・音声ではBetter Authを初期化しない。
    get auth() {
      return (auth ??= createAuth(env, undefined, db, backgroundTasks));
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
    session?: ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>;
    staffSession: NonNullable<
      Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>
    >;
    traceId: string;
  };
};
