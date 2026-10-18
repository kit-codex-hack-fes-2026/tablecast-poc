import { Hono } from "hono";
import type { ApiEnv } from "../../platform/context";
import { staffIdentity } from "../auth/middleware";
import { validateQuery } from "../../platform/validation";
import { billingQuerySchema } from "./model";
import { organizationBilling, organizationInvoices, organizationOperatingReport } from "./service";

export const billingRoutes = new Hono<ApiEnv>()
  .get(
    "/api/admin/organizations/:organizationId/billing",
    validateQuery(billingQuerySchema),
    async (c) => {
      const session = await staffIdentity(c),
        query = c.req.valid("query");
      return c.json(
        await organizationBilling(
          c.get("services"),
          session.user.id,
          c.req.param("organizationId"),
          query.month,
          query.before,
          query.search,
        ),
      );
    },
  )
  .get(
    "/api/admin/organizations/:organizationId/billing/invoices",
    validateQuery(billingQuerySchema),
    async (c) => {
      const session = await staffIdentity(c);
      return c.json(
        await organizationInvoices(
          c.get("services"),
          session.user.id,
          c.req.param("organizationId"),
          c.req.valid("query").before,
        ),
      );
    },
  );

export const operatingBillingRoutes = new Hono<ApiEnv>().get(
  "/api/operations/organizations/:organizationId/billing",
  validateQuery(billingQuerySchema),
  async (c) => {
    const session = await staffIdentity(c);
    return c.json(
      await organizationOperatingReport(
        c.get("services"),
        session.user.id,
        c.req.param("organizationId"),
        c.req.valid("query").month,
      ),
    );
  },
);
