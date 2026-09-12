import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { validate } from "../../platform/validation";
import { staffIdentity } from "../auth/middleware";
import { createStoreSchema } from "./model";
import { listMemberStores } from "./queries";
import { createStore } from "./service";
export const storesRoutes = new Hono<ApiEnv>()
  .get("/api/admin/stores", async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      {
        stores: await listMemberStores(c.get("services"), session.user.id),
        locale: session.user.locale,
      },
      200,
    );
  })
  .post("/api/admin/stores", validate(createStoreSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(await createStore(c.get("services"), session.user.id, c.req.valid("json")), 201);
  });
