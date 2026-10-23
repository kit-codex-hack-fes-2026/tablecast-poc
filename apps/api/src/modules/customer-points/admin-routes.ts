import { apiFactory } from "../../platform/http";
import { validate } from "../../platform/validation";
import { tableScope } from "../auth/middleware";
import { confirmPointsSchema, pointCorrectionSchema, pointPolicySchema } from "./model";
import { getPointPolicy, getPointVisit } from "./queries";
import { confirmCustomerPoints, correctCustomerPoints } from "./use-cases/allocation";
import { setPointPolicy } from "./use-cases/policy";
export const pointsAdminRoutes = apiFactory
  .createApp()
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
  .get("/tables/:id/points", tableScope, async (c) =>
    c.json(await getPointVisit(c.get("services"), c.get("actor")), 200),
  )
  .post("/tables/:id/points", validate(confirmPointsSchema), tableScope, async (c) =>
    c.json(
      await confirmCustomerPoints(c.get("services"), c.get("actor"), c.req.valid("json")),
      200,
    ),
  );
