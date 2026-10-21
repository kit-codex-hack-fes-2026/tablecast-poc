import { apiFactory } from "../../platform/http";
import { validateQuery } from "../../platform/validation";
import { statisticsQuerySchema } from "./model";
import { getStatistics } from "./service";
export const statisticsAdminRoutes = apiFactory
  .createApp()
  .get("/statistics", validateQuery(statisticsQuerySchema), async (c) =>
    c.json(await getStatistics(c.get("services"), c.get("actor"), c.req.valid("query")), 200),
  );
