import {
  billingAccess,
  billingSummary,
  billingVisits,
  billingCustomer,
  organizationCostReport,
} from "./queries";
import type { ApiServices } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { billingUsdJpy, utcMonthRange } from "./pricing";
import { billingEnabled, billingRates, stripeClient } from "./stripe";

export async function organizationBilling(
  services: ApiServices,
  userId: string,
  organizationId: string,
  month?: string,
  before?: string,
  search?: string,
) {
  const access = await billingAccess(services, userId, organizationId);
  const selected = month ?? new Date().toISOString().slice(0, 7);
  const range = utcMonthRange(selected);
  const [summary, visits] = await Promise.all([
    billingSummary(services, organizationId, range.start, range.end),
    billingVisits(services, organizationId, range.start, range.end, before, search),
  ]);
  const { chargeMicros, subscription, ...usage } = summary;
  const rows = visits
    .slice(0, 20)
    .map(({ chargeMicros: charge, ...row }) =>
      access.canManage ? { ...row, chargeMicros: charge } : row,
    );
  const common = {
    organization: { id: access.id, name: access.name },
    storeId: access.storeId,
    canManage: access.canManage,
    month: selected,
    period: range,
    usage,
    visits: rows,
    next: visits.length > 20 ? `${rows.at(-1)?.startedAt}|${rows.at(-1)?.id}` : null,
    updatedAt: Date.now(),
  };
  if (!access.canManage) return { ...common, financial: null };
  const checkoutRequired =
    !subscription?.stripeSubscriptionId ||
    ["canceled", "incomplete", "incomplete_expired"].includes(subscription.status);
  let monthlyBase: number | null = null;
  let priceUnavailable = false;
  if (billingEnabled(services.env)) {
    try {
      const price = await stripeClient(services.env).prices.retrieve(
        billingRates(services.env, checkoutRequired ? undefined : subscription?.plan).basePriceId,
      );
      ensure(price.currency === "jpy", "BILLING_CURRENCY_INVALID", 503);
      monthlyBase = price.unit_amount;
    } catch {
      priceUnavailable = true;
    }
  }
  return {
    ...common,
    financial: {
      chargeMicros,
      monthlyBase,
      priceUnavailable,
      checkoutRequired,
      checkoutPlan: billingEnabled(services.env) ? billingRates(services.env).version : null,
      configured: billingEnabled(services.env),
      subscription: subscription
        ? {
            plan: subscription.plan,
            status: subscription.status,
            periodStart: subscription.periodStart?.getTime() ?? null,
            periodEnd: subscription.periodEnd?.getTime() ?? null,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
          }
        : null,
    },
  };
}

export async function organizationInvoices(
  services: ApiServices,
  userId: string,
  organizationId: string,
  before?: string,
) {
  const access = await billingAccess(services, userId, organizationId);
  ensure(access.canManage, "ADMIN_REQUIRED", 403);
  if (!billingEnabled(services.env)) return { invoices: [], next: null };
  const customer = await billingCustomer(services, organizationId);
  if (!customer) return { invoices: [], next: null };
  const result = await stripeClient(services.env).invoices.list({
    customer,
    limit: 20,
    ...(before ? { starting_after: before } : {}),
  });
  ensure(
    result.data.every((invoice) => invoice.currency === "jpy"),
    "BILLING_CURRENCY_INVALID",
    503,
  );
  return {
    invoices: result.data.map((invoice) => ({
      id: invoice.id,
      number: invoice.number,
      createdAt: invoice.status_transitions.finalized_at
        ? invoice.status_transitions.finalized_at * 1000
        : null,
      periodStart: invoice.period_start * 1000,
      periodEnd: invoice.period_end * 1000,
      amount: invoice.status === "draft" ? null : invoice.total,
      currency: invoice.currency,
      status: invoice.status,
      url: invoice.hosted_invoice_url,
      pdf: invoice.invoice_pdf,
    })),
    next: result.has_more ? (result.data.at(-1)?.id ?? null) : null,
  };
}

// 運営だけが取得する。店舗のowner/admin権限ではこの経路を許可しない。
export async function organizationOperatingReport(
  services: ApiServices,
  userId: string,
  organizationId: string,
  month?: string,
) {
  ensure(
    (services.env.TABLECAST_BILLING_OPERATOR_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .includes(userId),
    "OPERATOR_REQUIRED",
    403,
  );
  const selected = month ?? new Date().toISOString().slice(0, 7),
    range = utcMonthRange(selected);
  const costs = await organizationCostReport(
    services,
    organizationId,
    selected,
    range.start,
    range.end,
  );
  const customer = await billingCustomer(services, organizationId);
  let revenue: { billedJpy: number; paidJpy: number; fetchedAt: number } | null = null;
  if (customer && billingEnabled(services.env)) {
    let billedJpy = 0,
      paidJpy = 0;
    for await (const invoice of stripeClient(services.env).invoices.list({
      customer,
      created: { gte: Math.floor(range.start / 1000), lt: Math.floor(range.end / 1000) },
      limit: 100,
    })) {
      ensure(invoice.currency === "jpy", "BILLING_CURRENCY_INVALID", 503);
      if (invoice.status !== "draft" && invoice.status !== "void") {
        billedJpy += invoice.total;
        paidJpy += invoice.amount_paid;
      }
    }
    revenue = { billedJpy, paidJpy, fetchedAt: Date.now() };
  }
  return {
    organizationId,
    month: selected,
    costs,
    usdJpy: billingUsdJpy,
    costJpy: costs.amountUsd === null ? null : costs.amountUsd * billingUsdJpy,
    revenue,
  };
}
