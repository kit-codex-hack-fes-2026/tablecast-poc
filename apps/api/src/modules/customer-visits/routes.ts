import { Hono } from "hono";
import { validate, validateQuery } from "../../platform/validation";
import { customerActor, type CustomerEnv } from "../customers/middleware";
import { customerOrderPageSchema, customerVisitCodeSchema, customerVisitPageSchema } from "./model";
import { getCustomerVisit, listCustomerOrders, listCustomerVisits } from "./queries";
import { joinCustomerVisit, leaveCustomerVisit, resolveCustomerVisit } from "./service";

export const customerVisitRoutes = new Hono<CustomerEnv>()
  .post("/visits/resolve", validate(customerVisitCodeSchema), async (c) => {
    return c.json(
      await resolveCustomerVisit(
        c.get("services"),
        c.get("customerUserId"),
        c.req.valid("json").code,
      ),
      200,
    );
  })
  .post("/visits/join", validate(customerVisitCodeSchema), async (c) => {
    return c.json(
      await joinCustomerVisit(c.get("services"), c.get("customerUserId"), c.req.valid("json").code),
      200,
    );
  })
  .get("/stores/:storeId/visits", validateQuery(customerVisitPageSchema), async (c) => {
    return c.json(
      await listCustomerVisits(c.get("services"), customerActor(c), c.req.valid("query")),
      200,
    );
  })
  .get("/stores/:storeId/visits/:sessionId", async (c) => {
    return c.json(
      await getCustomerVisit(c.get("services"), customerActor(c), c.req.param("sessionId")),
      200,
    );
  })
  .get(
    "/stores/:storeId/visits/:sessionId/orders",
    validateQuery(customerOrderPageSchema),
    async (c) => {
      return c.json(
        await listCustomerOrders(
          c.get("services"),
          customerActor(c),
          c.req.param("sessionId"),
          c.req.valid("query"),
        ),
        200,
      );
    },
  )
  .post("/stores/:storeId/visits/:sessionId/leave", async (c) => {
    return c.json(
      await leaveCustomerVisit(c.get("services"), customerActor(c), c.req.param("sessionId")),
      200,
    );
  });
