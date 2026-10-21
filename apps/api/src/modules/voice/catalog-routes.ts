import { apiFactory } from "../../platform/http";
import { validateQuery } from "../../platform/validation";
import { listVoices } from "./catalog";
import { voiceListQuerySchema } from "./model";
export const voiceAdminRoutes = apiFactory
  .createApp()
  .get("/voices", validateQuery(voiceListQuerySchema), async (c) =>
    c.json(await listVoices(c.env, c.get("actor"), c.req.valid("query")), 200),
  );
