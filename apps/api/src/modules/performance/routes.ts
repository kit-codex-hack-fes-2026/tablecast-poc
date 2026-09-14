import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { validate } from "../../platform/validation";
import { performanceBatchSchema } from "./model";
import { recordPerformance } from "./service";

export const performanceRoutes = new Hono<ApiEnv>().post(
  "/api/performance",
  async (c, next) => {
    ensure(c.req.header("Origin") === c.env.TABLECAST_PUBLIC_ORIGIN, "ORIGIN_FORBIDDEN", 403);
    await next();
  },
  validate(performanceBatchSchema),
  (c) => {
    const { metrics } = c.req.valid("json");
    recordPerformance(metrics, c.env);
    return c.json({ accepted: metrics.length }, 202);
  },
);
