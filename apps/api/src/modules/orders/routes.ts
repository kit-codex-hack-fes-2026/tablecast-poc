import { apiFactory } from "../../platform/http";
import { validate } from "../../platform/validation";
import { tableScope } from "../auth/middleware";
import { paymentSchema, recordPayment } from "./use-cases/payment";
import { changeOrderStatus, orderStatusSchema } from "./use-cases/status";
export const ordersAdminRoutes = apiFactory
  .createApp()
  .post("/tables/:id/payments", validate(paymentSchema), tableScope, async (c) =>
    c.json(await recordPayment(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .post("/orders/:id/status", validate(orderStatusSchema), async (c) =>
    c.json(
      await changeOrderStatus(
        c.get("services"),
        c.get("actor"),
        c.req.param("id"),
        c.req.valid("json").status,
      ),
      200,
    ),
  );
