import { Hono } from "hono";
import { validateQuery } from "../../platform/validation";
import { customerActor, type CustomerEnv } from "../customers/middleware";
import { pointPageSchema } from "./model";
import { getCustomerPoints } from "./queries";
export const customerPointsRoutes = new Hono<CustomerEnv>().get(
  "/stores/:storeId/points",
  validateQuery(pointPageSchema),
  async (c) => {
    return c.json(
      await getCustomerPoints(c.get("services"), customerActor(c), c.req.valid("query")),
      200,
    );
  },
);
