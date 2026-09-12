import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { accountRoutes } from "./modules/account/routes";
import { authRoutes } from "./modules/auth/routes";
import { devicesRoutes } from "./modules/devices/routes";
import { mcpRoutes } from "./modules/mcp/routes";
import { mediaRoutes } from "./modules/media/routes";
import { storesRoutes } from "./modules/stores/collection-routes";
import { admin } from "./modules/stores/routes";
import { systemRoutes } from "./modules/system/routes";
import { demoRoutes } from "./modules/demo/routes";
import { table } from "./modules/tables/routes";
import { voiceRoutes } from "./modules/voice/routes";
import type { ApiEnv } from "./platform/context";
import { requestServices } from "./platform/context";
import { handleError, handleRpcError, requestSecurity, requestTelemetry } from "./platform/http";
const rpcRoutes = new Hono<ApiEnv>()
  .onError(handleRpcError)
  .route("/", accountRoutes)
  .route("/", devicesRoutes)
  .route("/", storesRoutes)
  .route("/api/admin/stores/:storeId/demo", demoRoutes)
  .route("/api/admin/stores/:storeId", admin)
  .route("/api/table", table);
const app = new Hono<ApiEnv>()
  .use("*", requestTelemetry)
  .use("*", requestServices)
  .use("*", requestSecurity)
  .use(
    "*",
    bodyLimit({
      maxSize: 2 * 1024 * 1024,
      onError: (c: Context<ApiEnv>) =>
        c.json(
          {
            error: { code: "BODY_TOO_LARGE", message: "BODY_TOO_LARGE" },
            traceId: c.get("traceId"),
          },
          413,
        ),
    }),
  )
  .onError(handleError)
  .route("/", systemRoutes)
  .route("/", authRoutes)
  .route("/", rpcRoutes)
  .route("/internal/voice", voiceRoutes)
  .route("/mcp", mcpRoutes)
  .route("/", mediaRoutes);
export type AppType = typeof rpcRoutes;
export default app;
