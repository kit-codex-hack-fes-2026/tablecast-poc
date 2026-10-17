import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { validate, validateQuery } from "../../platform/validation";
import {
  applyCouponSchema,
  cancelCouponUseSchema,
  couponDefinitionSchema,
  couponPageSchema,
  issueCouponSchema,
  revokeCouponSchema,
  rewardMembersSchema,
} from "./model";
import { getVisitCoupons, listCouponRules, listRewardMembers, listIssuedCoupons } from "./queries";
import {
  applyCustomerCoupon,
  cancelCustomerCouponUse,
  issueCustomerCoupon,
  revokeCustomerCoupon,
  saveCouponRule,
} from "./service";
export const couponsAdminRoutes = new Hono<ApiEnv>()
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
  .get("/tables/:id/coupons", async (c) =>
    c.json(
      await getVisitCoupons(c.get("services"), {
        ...c.get("actor"),
        tableSessionId: c.req.param("id"),
      }),
      200,
    ),
  )
  .post("/tables/:id/coupons/apply", validate(applyCouponSchema), async (c) =>
    c.json(
      await applyCustomerCoupon(
        c.get("services"),
        { ...c.get("actor"), tableSessionId: c.req.param("id") },
        c.req.valid("json"),
      ),
      200,
    ),
  )
  .post("/tables/:id/coupons/cancel", validate(cancelCouponUseSchema), async (c) =>
    c.json(
      await cancelCustomerCouponUse(
        c.get("services"),
        { ...c.get("actor"), tableSessionId: c.req.param("id") },
        c.req.valid("json"),
      ),
      200,
    ),
  );
