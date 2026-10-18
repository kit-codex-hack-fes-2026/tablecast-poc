import { billingRateVersions } from "../../db/business-schema";
import { stripe } from "@better-auth/stripe";
import { Stripe } from "stripe";
import { and, eq, inArray } from "drizzle-orm";
import { member, subscription } from "../../db/auth-schema";
import type { Database } from "../../platform/context";
import { ensure } from "../../platform/errors";
import { billingRatesSchema } from "./model";

export const billingEnabled = (env: Partial<TablecastEnv>) =>
  env.TABLECAST_BILLING_ENABLED === "true";
export function billingPlans(env: Partial<TablecastEnv>) {
  const value: unknown = JSON.parse(
    env.TABLECAST_BILLING_RATES ||
      JSON.stringify({
        version: "tablecast-2026-10-18",
        markupBps: 10000,
        basePriceId: "price_disabled",
        meterPriceId: "price_disabled",
        eventName: "tablecast_ai_usage",
      }),
  );
  const plans = billingRatesSchema
    .array()
    .min(1)
    .parse(Array.isArray(value) ? value : [value]);
  ensure(
    new Set(plans.map((plan) => plan.version)).size === plans.length,
    "BILLING_VERSION_DUPLICATE",
    503,
  );
  return plans;
}
export function billingRates(env: Partial<TablecastEnv>, version?: string) {
  const plans = billingPlans(env);
  const rate = version ? plans.find((plan) => plan.version === version) : plans[0];
  ensure(rate, "BILLING_VERSION_UNAVAILABLE", 503);
  return rate;
}
export async function frozenBillingRates(
  env: Partial<TablecastEnv>,
  db: Database,
  version?: string,
) {
  const rates = billingRates(env, version),
    ratesJson = JSON.stringify(rates);
  await db
    .insert(billingRateVersions)
    .values({ version: rates.version, ratesJson })
    .onConflictDoNothing();
  const saved = await db
    .select()
    .from(billingRateVersions)
    .where(eq(billingRateVersions.version, rates.version))
    .get();
  ensure(saved?.ratesJson === ratesJson, "BILLING_VERSION_CHANGED", 503);
  return rates;
}
export const stripeClient = (env: Partial<TablecastEnv>) =>
  new Stripe(env.TABLECAST_STRIPE_SECRET_KEY ?? "", {
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 0,
    timeout: 15000,
  });

async function validateBillingPlan(env: Partial<TablecastEnv>, version: string) {
  const rate = billingRates(env, version),
    client = stripeClient(env);
  const [base, metered] = await Promise.all([
    client.prices.retrieve(rate.basePriceId),
    client.prices.retrieve(rate.meterPriceId),
  ]);
  ensure(
    base.currency === "jpy" &&
      base.recurring?.interval === "month" &&
      base.recurring.interval_count === 1 &&
      base.recurring.usage_type === "licensed" &&
      base.unit_amount !== null,
    "BILLING_BASE_PRICE_INVALID",
    503,
  );
  ensure(
    metered.currency === "jpy" &&
      metered.recurring?.interval === "month" &&
      metered.recurring.interval_count === 1 &&
      metered.recurring.usage_type === "metered" &&
      metered.billing_scheme === "per_unit" &&
      !metered.transform_quantity &&
      Number(metered.unit_amount_decimal) === 0.000001 &&
      metered.recurring.meter,
    "BILLING_METER_PRICE_INVALID",
    503,
  );
  const meter = await client.billing.meters.retrieve(metered.recurring.meter);
  ensure(
    meter.event_name === rate.eventName &&
      meter.default_aggregation.formula === "sum" &&
      meter.status === "active" &&
      meter.customer_mapping.type === "by_id" &&
      meter.customer_mapping.event_payload_key === "stripe_customer_id" &&
      meter.value_settings.event_payload_key === "value",
    "BILLING_METER_INVALID",
    503,
  );
}

export function billingPlugin(env: Partial<TablecastEnv>, db: Database) {
  if (!billingEnabled(env)) return [] as const;
  ensure(
    env.TABLECAST_BILLING_RATES &&
      env.TABLECAST_STRIPE_SECRET_KEY &&
      env.TABLECAST_STRIPE_WEBHOOK_SECRET,
    "BILLING_NOT_CONFIGURED",
    503,
  );
  const plans = billingPlans(env);
  return [
    stripe({
      stripeClient: stripeClient(env),
      stripeWebhookSecret: env.TABLECAST_STRIPE_WEBHOOK_SECRET ?? "",
      createCustomerOnSignUp: false,
      organization: { enabled: true },
      subscription: {
        enabled: true,
        requireEmailVerification: true,
        plans: plans.map((rates) => ({
          name: rates.version,
          priceId: rates.basePriceId,
          lineItems: [{ price: rates.meterPriceId }],
        })),
        authorizeReference: async ({ user, referenceId, action }, ctx) => {
          const row = await db
            .select({ role: member.role })
            .from(member)
            .where(and(eq(member.organizationId, referenceId), eq(member.userId, user.id)))
            .get();
          if (row?.role !== "owner" && row?.role !== "admin") return false;
          if (action === "upgrade-subscription") {
            const plan: unknown = ctx.body?.plan;
            ensure(typeof plan === "string", "BILLING_PLAN_REQUIRED", 422);
            if (plan !== plans[0]?.version) {
              const current = await db
                .select({ id: subscription.id })
                .from(subscription)
                .where(
                  and(
                    eq(subscription.referenceId, referenceId),
                    eq(subscription.plan, plan),
                    inArray(subscription.status, ["active", "trialing", "past_due"]),
                  ),
                )
                .get();
              ensure(current, "BILLING_PLAN_UNAVAILABLE", 403);
            }
            await validateBillingPlan(env, plan);
            await frozenBillingRates(env, db, plan);
          }
          return true;
        },
      },
    }),
  ] as const;
}
