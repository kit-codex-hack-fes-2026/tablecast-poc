import { apiFactory } from "../../platform/http";
import { validate, validateQuery } from "../../platform/validation";
import { tableScope } from "../auth/middleware";
import {
  applyCouponSchema,
  cancelCouponUseSchema,
  couponDefinitionSchema,
  couponPageSchema,
  issueCouponSchema,
  revokeCouponSchema,
  rewardMembersSchema,
} from "./model";
import { getVisitCoupons, listCouponRules, listIssuedCoupons, listRewardMembers } from "./queries";
import { applyCustomerCoupon, cancelCustomerCouponUse } from "./use-cases/apply";
import { issueCustomerCoupon } from "./use-cases/issue";
import { revokeCustomerCoupon, saveCouponRule } from "./use-cases/rules";
export const couponsAdminRoutes = apiFactory
  .createApp()
  .get("/coupons/issued", validateQuery(couponPageSchema), async (c) =>
    c.json(await listIssuedCoupons(c.get("services"), c.get("actor"), c.req.valid("query")), 200),
  )
  .get("/coupons/rules", validateQuery(couponPageSchema), async (c) =>
    c.json(await listCouponRules(c.get("services"), c.get("actor"), c.req.valid("query")), 200),
  )
  .post("/coupons/rules", validate(couponDefinitionSchema), async (c) =>
    c.json(await saveCouponRule(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .get("/coupons/members", validateQuery(rewardMembersSchema), async (c) =>
    c.json(await listRewardMembers(c.get("services"), c.get("actor"), c.req.valid("query")), 200),
  )
  .post("/coupons/issue", validate(issueCouponSchema), async (c) =>
    c.json(await issueCustomerCoupon(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .post("/coupons/:couponId/revoke", validate(revokeCouponSchema), async (c) =>
    c.json(
      await revokeCustomerCoupon(
        c.get("services"),
        c.get("actor"),
        c.req.param("couponId"),
        c.req.valid("json").reason,
      ),
      200,
    ),
  )
  .get("/tables/:id/coupons", tableScope, async (c) =>
    c.json(await getVisitCoupons(c.get("services"), c.get("actor")), 200),
  )
  .post("/tables/:id/coupons/apply", validate(applyCouponSchema), tableScope, async (c) =>
    c.json(await applyCustomerCoupon(c.get("services"), c.get("actor"), c.req.valid("json")), 200),
  )
  .post("/tables/:id/coupons/cancel", validate(cancelCouponUseSchema), tableScope, async (c) =>
    c.json(
      await cancelCustomerCouponUse(c.get("services"), c.get("actor"), c.req.valid("json")),
      200,
    ),
  );
