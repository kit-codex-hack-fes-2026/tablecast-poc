import { apiFactory } from "../../platform/http";
import { validate } from "../../platform/validation";
import { requireIdentity } from "../auth/middleware";
import { createStoreSchema } from "./model";
import { listMemberStores } from "./queries";
import { createStore } from "./service";
export const storesRoutes = apiFactory
  .createApp()
  .get("/api/admin/stores", requireIdentity, async (c) =>
    c.json(
      {
        stores: await listMemberStores(c.get("services"), c.var.staffSession.user.id),
        locale: c.var.staffSession.user.locale,
      },
      200,
    ),
  )
  .post("/api/admin/stores", validate(createStoreSchema), requireIdentity, async (c) =>
    c.json(
      await createStore(c.get("services"), c.var.staffSession.user.id, c.req.valid("json")),
      201,
    ),
  );
