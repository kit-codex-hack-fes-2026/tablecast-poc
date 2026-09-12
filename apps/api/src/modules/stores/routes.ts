import { Hono } from "hono";
import { z } from "zod";
import type { ApiEnv } from "../../platform/context";
import { validateForm, validateQuery } from "../../platform/validation";
import { requireStore } from "../auth/middleware";
import { catalogAdminRoutes } from "../catalog/routes";
import { configurationAdminRoutes } from "../configuration/routes";
import { devicesAdminRoutes } from "../devices/admin-routes";
import { ordersAdminRoutes } from "../orders/routes";
import { tablesAdminRoutes } from "../tables/admin-routes";
import { voiceAdminRoutes } from "../voice/catalog-routes";
import { getAdminState, getEvents } from "./queries";
import { updateStoreIcon } from "./service";
export const admin = new Hono<ApiEnv>()
  .use("*", requireStore)
  .get("/", async (c) => c.json(await getAdminState(c.get("services"), c.get("actor")), 200))
  .post("/icon", validateForm(z.object({ image: z.instanceof(File) })), async (c) => {
    return c.json(
      await updateStoreIcon(
        c.get("services"),
        c.get("actor"),
        c.req.raw.headers,
        c.req.valid("form").image,
      ),
      200,
    );
  })
  .get(
    "/events",
    validateQuery(z.object({ after: z.coerce.number().int().nonnegative().default(0) })),
    async (c) =>
      c.json(await getEvents(c.get("services"), c.get("actor"), c.req.valid("query").after), 200),
  )
  .get("/live", async (c) => {
    const actor = c.get("actor");
    return c.env.TABLECAST_EVENTS.get(c.env.TABLECAST_EVENTS.idFromName(actor.storeId)).fetch(
      c.req.raw,
    );
  })
  .route("/", catalogAdminRoutes)
  .route("/", voiceAdminRoutes)
  .route("/", tablesAdminRoutes)
  .route("/", ordersAdminRoutes)
  .route("/", devicesAdminRoutes)
  .route("/", configurationAdminRoutes);
