import { accountRoutes } from "./modules/account/routes";
import { authRoutes } from "./modules/auth/routes";
import { billingRoutes, operatingBillingRoutes } from "./modules/billing/routes";
import { customerRoutes } from "./modules/customers/routes";
import { demoRoutes } from "./modules/demo/routes";
import { devicesRoutes } from "./modules/devices/routes";
import { mcpRoutes } from "./modules/mcp/routes";
import { mediaRoutes } from "./modules/media/routes";
import { posOperatingRoutes } from "./modules/pos/routes";
import { storesRoutes } from "./modules/stores/collection-routes";
import { initialRoutes } from "./modules/stores/initial-routes";
import { admin } from "./modules/stores/routes";
import { systemRoutes } from "./modules/system/routes";
import { table } from "./modules/tables/routes";
import { createHttpApp } from "./platform/app";
import { apiFactory, handleRpcError } from "./platform/http";
const rpcRoutes = apiFactory
  .createApp()
  .onError(handleRpcError)
  .route("/", billingRoutes)
  .route("/", accountRoutes)
  .route("/api/customer", customerRoutes)
  .route("/", devicesRoutes)
  .route("/", storesRoutes)
  .route("/", initialRoutes)
  .route("/api/admin/stores/:storeId/demo", demoRoutes)
  .route("/api/admin/stores/:storeId", admin)
  .route("/api/table", table);
const app = createHttpApp()
  .route("/", posOperatingRoutes)
  .route("/", operatingBillingRoutes)
  .route("/", systemRoutes)
  .route("/", authRoutes)
  .route("/", rpcRoutes)
  .route("/mcp", mcpRoutes)
  .route("/", mediaRoutes);
export type AppType = typeof rpcRoutes;
export default app;
