import { instrument } from "@inference-net/otel-cf-workers";
import { type TelemetryEnv } from "./platform/telemetry-content";
import { telemetryConfig } from "./platform/telemetry-export";
export { TablecastEmulate } from "./containers";
export { TablecastVoiceUsage } from "./modules/billing/observer";
export { StoreEvents } from "./realtime/store-events";
export default instrument(
  {
    async scheduled(controller, env) {
      const { collectContainerMetrics } = await import("./platform/container-metrics");
      const [{ runBillingMaintenance }, { createApiServices }] = await Promise.all([
        import("./modules/billing/sync"),
        import("./platform/context"),
      ]);
      await Promise.all([
        env.TABLECAST_CONTAINER_METRICS_APPLICATIONS &&
        env.TABLECAST_CONTAINER_METRICS_APPLICATIONS !== "[]"
          ? collectContainerMetrics(env, controller.scheduledTime)
          : Promise.resolve(),
        runBillingMaintenance(createApiServices(env), controller.scheduledTime),
      ]);
    },
    // HonoとAgentの初期化をリクエスト内へ移し、Worker起動時のCPU制限を守る。
    async fetch(request, env, ctx) {
      const { default: app } = await import("./app");
      return app.fetch(request, env, ctx);
    },
  } satisfies ExportedHandler<TablecastEnv>,
  (env: TablecastEnv & TelemetryEnv) => telemetryConfig(env, "tablecast-api"),
);
