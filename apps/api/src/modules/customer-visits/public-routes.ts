import { apiFactory } from "../../platform/http";
import { validate } from "../../platform/validation";
import { customerVisitCodeSchema } from "./model";
import { resolveCustomerVisitBranding } from "./service";

export const memberVisitPublicRoutes = apiFactory
  .createApp()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await next();
  })
  .post("/branding", validate(customerVisitCodeSchema), async (c) => {
    return c.json(
      await resolveCustomerVisitBranding(c.var.services, c.req.valid("json").code),
      200,
    );
  });
