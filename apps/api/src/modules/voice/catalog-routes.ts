import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { validateQuery } from "../../platform/validation";
import { listVoices } from "./catalog";
import { voiceListQuerySchema } from "./model";
export const voiceAdminRoutes = new Hono<ApiEnv>().get(
  "/voices",
  validateQuery(voiceListQuerySchema),
  async (c) => c.json(await listVoices(c.env, c.get("actor"), c.req.valid("query"))),
);
