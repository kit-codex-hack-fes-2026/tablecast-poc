import { validate, validateQuery } from "../../platform/validation";
import { customerCouponRoutes } from "../customer-coupons/routes";
import { customerMemoryRoutes } from "../customer-memory/routes";
import { customerPointsRoutes } from "../customer-points/routes";
import { customerVisitRoutes } from "../customer-visits/routes";
import { customerActor, customerFactory, requireCustomerIdentity } from "./middleware";
import {
  customerMembershipPageSchema,
  customerPreferencesSchema,
  customerRevisionSchema,
  enrolCustomerSchema,
} from "./model";
import { getCustomerStore, listCustomerMemberships } from "./queries";
import { enrolCustomer, leaveCustomerMembership, updateCustomerPreferences } from "./service";

export const customerRoutes = customerFactory
  .createApp()
  .use("*", requireCustomerIdentity)
  .get("/memberships", validateQuery(customerMembershipPageSchema), async (c) => {
    return c.json(
      await listCustomerMemberships(
        c.get("services"),
        c.get("customerUserId"),
        c.req.valid("query"),
      ),
      200,
    );
  })
  .get("/stores/:storeId", async (c) => {
    return c.json(await getCustomerStore(c.get("services"), customerActor(c)), 200);
  })
  .post("/stores/:storeId/enrol", validate(enrolCustomerSchema), async (c) => {
    return c.json(await enrolCustomer(c.get("services"), customerActor(c)), 200);
  })
  .post("/stores/:storeId/preferences", validate(customerPreferencesSchema), async (c) => {
    return c.json(
      await updateCustomerPreferences(c.get("services"), customerActor(c), c.req.valid("json")),
      200,
    );
  })
  .post("/stores/:storeId/leave", validate(customerRevisionSchema), async (c) => {
    return c.json(
      await leaveCustomerMembership(
        c.get("services"),
        customerActor(c),
        c.req.valid("json").revision,
      ),
      200,
    );
  })
  .route("/", customerVisitRoutes)
  .route("/", customerMemoryRoutes)
  .route("/", customerPointsRoutes)
  .route("/", customerCouponRoutes);
