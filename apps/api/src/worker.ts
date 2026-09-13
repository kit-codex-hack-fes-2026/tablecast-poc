import { instrument } from "@inference-net/otel-cf-workers";
import { env as bindings } from "cloudflare:workers";
import { telemetryConfig, type TelemetryEnv } from "./platform/telemetry";
export { StoreEvents } from "./realtime/store-events";
export { TablecastVoice, TablecastEmulate } from "./containers";
export default instrument(
  {
    async scheduled(controller, env) {
      const { collectContainerMetrics } = await import("./platform/container-metrics");
      await collectContainerMetrics(env, controller.scheduledTime);
    },
    // HonoとAgentの初期化をリクエスト内へ移し、Worker起動時のCPU制限を守る。
    async fetch(request, env, ctx) {
      const { default: app } = await import("./app");
      // ContainerはOTelのRPC引数を復元しないため、音声制御には標準bindingを渡す。
      return app.fetch(request, { ...env, TABLECAST_VOICE: bindings.TABLECAST_VOICE }, ctx);
    },
  } satisfies ExportedHandler<TablecastEnv>,
  (env: TablecastEnv & TelemetryEnv) => telemetryConfig(env, "tablecast-api"),
);
