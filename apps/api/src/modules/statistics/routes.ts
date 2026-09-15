import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { validateQuery } from "../../platform/validation";
import { statisticsQuerySchema } from "./model";
import { getStatistics } from "./service";
export const statisticsAdminRoutes = new Hono<ApiEnv>().get(
  "/statistics",
  validateQuery(statisticsQuerySchema),
  async (c) =>
    c.json(await getStatistics(c.get("services"), c.get("actor"), c.req.valid("query")), 200),
);
