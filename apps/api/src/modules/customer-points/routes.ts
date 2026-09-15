import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { validateQuery } from "../../platform/validation";
import { staffIdentity } from "../auth/middleware";
import { pointPageSchema } from "./model";
import { getCustomerPoints } from "./queries";
export const customerPointsRoutes = new Hono<ApiEnv>().get(
  "/stores/:storeId/points",
  validateQuery(pointPageSchema),
  async (c) => {
    c.header("Cache-Control", "private, no-store");
    const session = await staffIdentity(c);
    return c.json(
      await getCustomerPoints(
        c.get("services"),
        { kind: "customer", userId: session.user.id, storeId: c.req.param("storeId") },
        c.req.valid("query"),
      ),
      200,
    );
  },
);
