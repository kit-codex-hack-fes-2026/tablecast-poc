import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { validate } from "../../platform/validation";
import { confirmPointsSchema, pointCorrectionSchema, pointPolicySchema } from "./model";
import { getPointPolicy, getPointVisit } from "./queries";
import { confirmCustomerPoints, correctCustomerPoints, setPointPolicy } from "./service";
export const pointsAdminRoutes = new Hono<ApiEnv>()
  .get("/points/policy", async (c) =>
    c.json(await getPointPolicy(c.get("services"), c.get("actor")), 200),
  )
  .post("/points/policy", validate(pointPolicySchema), async (c) =>
    c.json(await setPointPolicy(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .post("/points/corrections", validate(pointCorrectionSchema), async (c) =>
    c.json(
      await correctCustomerPoints(c.get("services"), c.get("actor"), c.req.valid("json")),
      200,
    ),
  )
  .get("/tables/:id/points", async (c) =>
    c.json(
      await getPointVisit(c.get("services"), {
        ...c.get("actor"),
        tableSessionId: c.req.param("id"),
      }),
      200,
    ),
  )
  .post("/tables/:id/points", validate(confirmPointsSchema), async (c) =>
    c.json(
      await confirmCustomerPoints(
        c.get("services"),
        { ...c.get("actor"), tableSessionId: c.req.param("id") },
        c.req.valid("json"),
      ),
      200,
    ),
  );
