import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { validate, validateQuery } from "../../platform/validation";
import { staffIdentity } from "../auth/middleware";
import { customerOrderPageSchema, customerVisitCodeSchema, customerVisitPageSchema } from "./model";
import { getCustomerVisit, listCustomerOrders, listCustomerVisits } from "./queries";
import { joinCustomerVisit, leaveCustomerVisit, resolveCustomerVisit } from "./service";

export const customerVisitRoutes = new Hono<ApiEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await staffIdentity(c);
    await next();
  })
  .post("/visits/resolve", validate(customerVisitCodeSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await resolveCustomerVisit(c.get("services"), session.user.id, c.req.valid("json").code),
      200,
    );
  })
  .post("/visits/join", validate(customerVisitCodeSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await joinCustomerVisit(c.get("services"), session.user.id, c.req.valid("json").code),
      200,
    );
  })
  .get("/stores/:storeId/visits", validateQuery(customerVisitPageSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await listCustomerVisits(
        c.get("services"),
        { kind: "customer", userId: session.user.id, storeId: c.req.param("storeId") },
        c.req.valid("query"),
      ),
      200,
    );
  })
  .get("/stores/:storeId/visits/:sessionId", async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await getCustomerVisit(
        c.get("services"),
        { kind: "customer", userId: session.user.id, storeId: c.req.param("storeId") },
        c.req.param("sessionId"),
      ),
      200,
    );
  })
  .get(
    "/stores/:storeId/visits/:sessionId/orders",
    validateQuery(customerOrderPageSchema),
    async (c) => {
      const session = await staffIdentity(c);
      return c.json(
        await listCustomerOrders(
          c.get("services"),
          { kind: "customer", userId: session.user.id, storeId: c.req.param("storeId") },
          c.req.param("sessionId"),
          c.req.valid("query"),
        ),
        200,
      );
    },
  )
  .post("/stores/:storeId/visits/:sessionId/leave", async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await leaveCustomerVisit(
        c.get("services"),
        { kind: "customer", userId: session.user.id, storeId: c.req.param("storeId") },
        c.req.param("sessionId"),
      ),
      200,
    );
  });
