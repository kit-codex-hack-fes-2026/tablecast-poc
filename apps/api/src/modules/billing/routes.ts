import { apiFactory } from "../../platform/http";
import { validateQuery } from "../../platform/validation";
import { requireIdentity } from "../auth/middleware";
import { billingQuerySchema } from "./model";
import { organizationBilling, organizationInvoices, organizationOperatingReport } from "./service";

export const billingRoutes = apiFactory
  .createApp()
  .get(
    "/api/admin/organizations/:organizationId/billing",
    validateQuery(billingQuerySchema),
    requireIdentity,
    async (c) => {
      const query = c.req.valid("query");
      return c.json(
        await organizationBilling(
          c.get("services"),
          c.var.staffSession.user.id,
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
    requireIdentity,
    async (c) =>
      c.json(
        await organizationInvoices(
          c.get("services"),
          c.var.staffSession.user.id,
          c.req.param("organizationId"),
          c.req.valid("query").before,
        ),
      ),
  );

export const operatingBillingRoutes = apiFactory
  .createApp()
  .get(
    "/api/operations/organizations/:organizationId/billing",
    validateQuery(billingQuerySchema),
    requireIdentity,
    async (c) =>
      c.json(
        await organizationOperatingReport(
          c.get("services"),
          c.var.staffSession.user.id,
          c.req.param("organizationId"),
          c.req.valid("query").month,
        ),
      ),
  );
