import { apiFactory } from "../../platform/http";
import { instructionResponse } from "../configuration/instruction-response";
import { withImageAssets } from "../media/queries";
import { getCatalog } from "./queries";
export const catalogAdminRoutes = apiFactory
  .createApp()
  .get("/catalog", async (c) =>
    c.json(
      instructionResponse(
        await withImageAssets(
          c.var.services,
          await getCatalog(c.var.services, c.var.actor.storeId),
        ),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    ),
  );
