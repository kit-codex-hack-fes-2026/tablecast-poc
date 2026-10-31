import { validate, validateQuery } from "../../platform/validation";
import { customerActor, customerFactory } from "../customers/middleware";
import { imageResponse } from "../media/routes";
import { couponPageSchema, exchangeCouponSchema, requestCouponSchema } from "./model";
import { listCouponExchanges, listCustomerCoupons, requireCouponImage } from "./queries";
import { exchangeCustomerCoupon } from "./use-cases/issue";
import { requestCustomerCoupon } from "./use-cases/selection";
export const customerCouponRoutes = customerFactory
  .createApp()
  .get("/stores/:storeId/coupons/images/:key{.+}", async (c) => {
    const actor = customerActor(c);
    await requireCouponImage(c.var.services, actor, c.req.param("key"));
    return imageResponse(c, actor.storeId, c.req.param("key"));
  })
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
