import { requireDevice } from "./modules/auth/middleware";
import { requireDemo } from "./modules/demo/middleware";
import { orderingOperations } from "./modules/tables/ordering-routes";
import { createHttpApp } from "./platform/app";
import { apiFactory, handleRpcError } from "./platform/http";

// 両入口とも通常APIと同じrouter・業務処理を使い、音声生成・ゲーム・MCPは必要時に読む。
const rpc = apiFactory
  .createApp()
  .onError(handleRpcError)
  .route(
    "/api/table",
    apiFactory.createApp().use("*", requireDevice).route("/", orderingOperations),
  )
  .route(
    "/api/admin/stores/:storeId/demo/:demoId/table",
    apiFactory.createApp().use("*", requireDemo).route("/", orderingOperations),
  );
export default createHttpApp().route("/", rpc);
