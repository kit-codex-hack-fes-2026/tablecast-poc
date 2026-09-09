export { StoreEvents } from "./realtime/store-events";
export { TablecastVoice, TablecastEmulate } from "./containers";
export default {
  // HonoとAgentの初期化をリクエスト内へ移し、Worker起動時のCPU制限を守る。
  async fetch(request, env, ctx) {
    const { default: app } = await import("./app");
    return app.fetch(request, env, ctx);
  },
} satisfies ExportedHandler<TablecastEnv>;
