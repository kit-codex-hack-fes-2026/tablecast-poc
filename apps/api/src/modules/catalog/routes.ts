import { instructionResponse } from "../configuration/instruction-response";
import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { getCatalog } from "./queries";
export const catalogAdminRoutes = new Hono<ApiEnv>().get("/catalog", async (c) =>
  c.json(
    instructionResponse(
      await getCatalog(c.get("services"), c.get("actor").storeId),
      c.req.header("X-Tablecast-Instructions"),
    ),
    200,
  ),
);
