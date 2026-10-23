import { validateQuery } from "../../platform/validation";
import { customerActor, customerFactory } from "../customers/middleware";
import { pointPageSchema } from "./model";
import { getCustomerPoints } from "./queries";
export const customerPointsRoutes = customerFactory
  .createApp()
  .get("/stores/:storeId/points", validateQuery(pointPageSchema), async (c) => {
    return c.json(
      await getCustomerPoints(c.get("services"), customerActor(c), c.req.valid("query")),
      200,
    );
  });
