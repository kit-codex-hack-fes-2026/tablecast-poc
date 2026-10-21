import { apiFactory } from "../../platform/http";
export const systemRoutes = apiFactory
  .createApp()
  .get("/api/health", (c) => c.json({ status: "ok", releaseSha: c.env.TABLECAST_RELEASE_SHA }));
