import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { validate, validateQuery } from "../../platform/validation";
import { staffIdentity } from "../auth/middleware";
import { couponPageSchema, exchangeCouponSchema, requestCouponSchema } from "./model";
import { listCouponExchanges, listCustomerCoupons } from "./queries";
import { exchangeCustomerCoupon, requestCustomerCoupon } from "./service";
export const customerCouponRoutes = new Hono<ApiEnv>()
  .use("*", async (c, next) => {
    c.header("Cache-Control", "private, no-store");
    await staffIdentity(c);
    await next();
  })
  .get("/stores/:storeId/coupons", validateQuery(couponPageSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await listCustomerCoupons(
        c.get("services"),
        { kind: "customer", storeId: c.req.param("storeId"), userId: session.user.id },
        c.req.valid("query"),
      ),
      200,
    );
  })
  .get("/stores/:storeId/coupons/exchanges", validateQuery(couponPageSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await listCouponExchanges(
        c.get("services"),
        { kind: "customer", storeId: c.req.param("storeId"), userId: session.user.id },
        c.req.valid("query"),
      ),
      200,
    );
  })
  .post("/stores/:storeId/coupons/exchange", validate(exchangeCouponSchema), async (c) => {
    const session = await staffIdentity(c);
    const input = c.req.valid("json");
    return c.json(
      await exchangeCustomerCoupon(
        c.get("services"),
        { kind: "customer", storeId: c.req.param("storeId"), userId: session.user.id },
        input.ruleId,
        input.idempotencyKey,
      ),
      200,
    );
  })
  .post("/stores/:storeId/coupons/:couponId/request", validate(requestCouponSchema), async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await requestCustomerCoupon(
        c.get("services"),
        { kind: "customer", storeId: c.req.param("storeId"), userId: session.user.id },
        c.req.param("couponId"),
        c.req.valid("json").sessionId,
      ),
      200,
    );
  });
