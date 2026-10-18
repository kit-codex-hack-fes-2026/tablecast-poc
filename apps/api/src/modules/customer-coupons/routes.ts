import { Hono } from "hono";
import { customerActor, type CustomerEnv } from "../customers/middleware";
import { validate, validateQuery } from "../../platform/validation";
import { couponPageSchema, exchangeCouponSchema, requestCouponSchema } from "./model";
import { listCouponExchanges, listCustomerCoupons } from "./queries";
import { exchangeCustomerCoupon, requestCustomerCoupon } from "./service";
export const customerCouponRoutes = new Hono<CustomerEnv>()
  .get("/stores/:storeId/coupons", validateQuery(couponPageSchema), async (c) => {
    return c.json(
      await listCustomerCoupons(c.get("services"), customerActor(c), c.req.valid("query")),
      200,
    );
  })
  .get("/stores/:storeId/coupons/exchanges", validateQuery(couponPageSchema), async (c) => {
    return c.json(
      await listCouponExchanges(c.get("services"), customerActor(c), c.req.valid("query")),
      200,
    );
  })
  .post("/stores/:storeId/coupons/exchange", validate(exchangeCouponSchema), async (c) => {
    const input = c.req.valid("json");
    return c.json(
      await exchangeCustomerCoupon(
        c.get("services"),
        customerActor(c),
        input.ruleId,
        input.idempotencyKey,
      ),
      200,
    );
  })
  .post("/stores/:storeId/coupons/:couponId/request", validate(requestCouponSchema), async (c) => {
    return c.json(
      await requestCustomerCoupon(
        c.get("services"),
        customerActor(c),
        c.req.param("couponId"),
        c.req.valid("json").sessionId,
      ),
      200,
    );
  });
