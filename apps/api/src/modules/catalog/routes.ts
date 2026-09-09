import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { getCatalog } from "./queries";
export const catalogAdminRoutes = new Hono<ApiEnv>().get("/catalog", async (c) =>
  c.json(await getCatalog(c.get("services"), c.get("actor").storeId)),
);
