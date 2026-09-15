import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { validate } from "../../platform/validation";
import { staffIdentity } from "../auth/middleware";
import { customerPreferencesSchema, customerRevisionSchema, enrolCustomerSchema } from "./model";
import { getCustomerStore, listCustomerMemberships } from "./queries";
import { enrolCustomer, leaveCustomerMembership, updateCustomerPreferences } from "./service";

export const customerRoutes = new Hono<ApiEnv>()
  .use("/api/customer/*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await staffIdentity(c);
    await next();
  })
  .get("/api/customer/memberships", async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      { memberships: await listCustomerMemberships(c.get("services"), session.user.id) },
      200,
    );
  })
  .get("/api/customer/stores/:storeId", async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await getCustomerStore(c.get("services"), {
        kind: "customer",
        userId: session.user.id,
        storeId: c.req.param("storeId"),
      }),
      200,
    );
  })
  .post("/api/customer/stores/:storeId/enrol", validate(enrolCustomerSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await enrolCustomer(c.get("services"), {
        kind: "customer",
        userId: session.user.id,
        storeId: c.req.param("storeId"),
      }),
      200,
    );
  })
  .post(
    "/api/customer/stores/:storeId/preferences",
    validate(customerPreferencesSchema),
    async (c) => {
      const session = await staffIdentity(c);
      return c.json(
        await updateCustomerPreferences(
          c.get("services"),
          { kind: "customer", userId: session.user.id, storeId: c.req.param("storeId") },
          c.req.valid("json"),
        ),
        200,
      );
    },
  )
  .post("/api/customer/stores/:storeId/leave", validate(customerRevisionSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await leaveCustomerMembership(
        c.get("services"),
        { kind: "customer", userId: session.user.id, storeId: c.req.param("storeId") },
        c.req.valid("json").revision,
      ),
      200,
    );
  });
