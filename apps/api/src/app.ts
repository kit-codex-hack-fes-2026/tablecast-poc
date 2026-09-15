import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { accountRoutes } from "./modules/account/routes";
import { customerRoutes } from "./modules/customers/routes";
import { authRoutes } from "./modules/auth/routes";
import { devicesRoutes } from "./modules/devices/routes";
import { mcpRoutes } from "./modules/mcp/routes";
import { mediaRoutes } from "./modules/media/routes";
import { initialRoutes } from "./modules/stores/initial-routes";
import { storesRoutes } from "./modules/stores/collection-routes";
import { admin } from "./modules/stores/routes";
import { systemRoutes } from "./modules/system/routes";
import { demoRoutes } from "./modules/demo/routes";
import { table } from "./modules/tables/routes";
import type { ApiEnv } from "./platform/context";
import { requestServices } from "./platform/context";
import { handleError, handleRpcError, requestSecurity, requestTelemetry } from "./platform/http";
const rpcRoutes = new Hono<ApiEnv>()
  .onError(handleRpcError)
  .route("/", accountRoutes)
  .route("/", customerRoutes)
  .route("/", devicesRoutes)
  .route("/", storesRoutes)
  .route("/", initialRoutes)
  .route("/api/admin/stores/:storeId/demo", demoRoutes)
  .route("/api/admin/stores/:storeId", admin)
  .route("/api/table", table);
const app = new Hono<ApiEnv>()
  .use("*", requestTelemetry)
  .use("*", requestServices)
  .use("*", requestSecurity)
  .use("*", (c, next) =>
    bodyLimit({
      maxSize:
        c.req.path === "/mcp" || /^\/api\/admin\/stores\/[^/]+\/images$/.test(c.req.path)
          ? 8 * 1024 * 1024
          : 2 * 1024 * 1024,
      onError: (context: Context<ApiEnv>) =>
        context.json(
          {
            error: { code: "BODY_TOO_LARGE", message: "BODY_TOO_LARGE" },
            traceId: context.get("traceId"),
          },
          413,
        ),
    })(c, next),
  )
  .onError(handleError)
  .route("/", systemRoutes)
  .route("/", authRoutes)
  .route("/", rpcRoutes)
  .route("/mcp", mcpRoutes)
  .route("/", mediaRoutes);
export type AppType = typeof rpcRoutes;
export default app;
