import { apiFactory } from "../../platform/http";
import { instructionResponse } from "../configuration/instruction-response";
import { getCatalog } from "./queries";
export const catalogAdminRoutes = apiFactory
  .createApp()
  .get("/catalog", async (c) =>
    c.json(
      instructionResponse(
        await getCatalog(c.get("services"), c.get("actor").storeId),
        c.req.header("X-Tablecast-Instructions"),
      ),
      200,
    ),
  );
