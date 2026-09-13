import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
export const systemRoutes = new Hono<ApiEnv>().get("/api/health", (c) =>
  c.json({ status: "ok", releaseSha: c.env.TABLECAST_RELEASE_SHA }),
);
