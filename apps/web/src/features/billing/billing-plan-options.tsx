import { ArrowUpRight } from "lucide-react";
import { type ReactNode } from "react";
import { DateTime } from "../../components/date-time";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { billingMoney } from "./billing-format";
import { Metric } from "./billing-monthly-usage";
import { PlanFeatures } from "./billing-plan-features";
import { type Billing } from "./billing-query";

export function CurrentPlan({ financial }: { financial: NonNullable<Billing["financial"]> }) {
  const { t } = useI18n();
  const free = financial.checkoutRequired;
  return (
    <section
      className="space-y-5 rounded-xl border border-border bg-card p-5 sm:p-6"
      aria-labelledby="tablecast-billing-contract"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{t("billing_contract")}</p>
          <h2 id="tablecast-billing-contract" className="mt-1 text-2xl font-semibold">
            {t(free ? "billing_free_plan" : "billing_standard_plan")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(free ? "billing_free_hint" : "billing_paid_hint")}
          </p>
        </div>
        <a
          href="#tablecast-billing-plans"
          className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
        >
          {t("billing_compare_plans")}
        </a>
      </div>
      {free ? (
        <div className="rounded-lg bg-secondary/50 p-4 text-sm">
          <p className="font-medium">{t("billing_free_cycle")}</p>
          <p className="mt-1 text-muted-foreground">{t("billing_free_no_card")}</p>
        </div>
      ) : (
        <PaidCycle financial={financial} />
      )}
    </section>
  );
}

function PaidCycle({ financial }: { financial: NonNullable<Billing["financial"]> }) {
  const { t, locale } = useI18n();
  const scheduled = Boolean(financial.subscription?.cancelAtPeriodEnd);
  const cycle = financial.currentCycle;
  const base = financial.monthlyBase === null ? "—" : billingMoney(financial.monthlyBase, locale);
  return (
    <>
      {financial.subscription?.status !== "active" && (
        <p role="status" className="text-sm text-destructive">
          {t(
            financial.subscription?.status === "past_due" ? "billing_past_due" : "billing_inactive",
          )}
        </p>
      )}
      {cycle ? (
        <dl className="grid gap-4 rounded-lg bg-secondary/50 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">{t("billing_cycle")}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-x-2 font-medium">
              <DateTime value={cycle.start} />
              <span>–</span>
              <DateTime value={cycle.end} />
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">
              {t(scheduled ? "billing_final_date" : "billing_next_date")}
            </dt>
            <dd className="mt-1 font-medium">
              <DateTime value={cycle.end} />
            </dd>
          </div>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{t("billing_cycle_pending")}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Metric label={t("billing_base")} value={base} detail={t("billing_base_hint")} />
        <Metric
          label={t("billing_cycle_charge")}
          value={cycle ? billingMoney(cycle.chargeMicros / 1e6, locale) : "—"}
          detail={t("billing_cycle_charge_hint")}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {t("billing_estimate_hint")}
        {cycle && cycle.unconfirmed > 0 && ` ${t("billing_unconfirmed")}: ${cycle.unconfirmed}`}
      </p>
      {scheduled && (
        <p role="status" className="rounded-lg border border-border p-4 text-sm font-medium">
          {t("billing_cancel_scheduled")}
          {financial.subscription?.periodEnd && (
            <>
              {" "}
              · <DateTime value={financial.subscription.periodEnd} />
            </>
          )}
          <span className="mt-1 block font-normal text-muted-foreground">
            {t("billing_cancel_effect")}
          </span>
        </p>
      )}
    </>
  );
}

export function PlanOptions({
  financial,
  disabled,
  onManage,
  children,
}: {
  children: ReactNode;
  disabled: boolean;
  financial: NonNullable<Billing["financial"]>;
  onManage: () => void;
}) {
  const { t, locale } = useI18n();
  const free = financial.checkoutRequired;
  const scheduled = !free && Boolean(financial.subscription?.cancelAtPeriodEnd);
  const base = financial.monthlyBase === null ? "—" : billingMoney(financial.monthlyBase, locale);
  return (
    <section className="space-y-4" aria-labelledby="tablecast-billing-plans">
      <div>
        <h2 id="tablecast-billing-plans" className="scroll-mt-28 text-xl font-semibold">
          {t("billing_plans")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("billing_plans_hint")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">{t("billing_free_plan")}</h3>
            {free && (
              <span className="rounded-md bg-secondary px-2 py-1 text-xs font-medium">
                {t("billing_current_plan")}
              </span>
            )}
          </div>
          <p className="text-3xl font-semibold tabular-nums">
            {billingMoney(0, locale)}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {t("billing_per_month")}
            </span>
          </p>
          <PlanFeatures
            items={[
              t("billing_feature_menu"),
              t("billing_feature_order"),
              t("billing_feature_manage"),
            ]}
          />
          <p className="text-sm text-muted-foreground">{t("billing_free_ai")}</p>
          <Button
            variant="outline"
            className="mt-auto w-full whitespace-normal"
            disabled={free || scheduled || disabled}
            onClick={onManage}
          >
            {t(
              free
                ? "billing_current_plan"
                : scheduled
                  ? "billing_free_scheduled"
                  : "billing_downgrade",
            )}
            {!free && !scheduled && <ArrowUpRight className="size-4" />}
          </Button>
        </div>
        <div className="flex flex-col gap-4 rounded-xl border border-primary/40 bg-primary/5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">{t("billing_standard_plan")}</h3>
            {!free && (
              <span className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                {t("billing_current_plan")}
              </span>
            )}
          </div>
          <p className="text-3xl font-semibold tabular-nums">
            {base}
            <span className="ml-1 text-sm font-normal text-muted-foreground">
              {t("billing_per_month")}
            </span>
          </p>
          <p className="text-sm font-medium">{t("billing_plus_usage")}</p>
          <PlanFeatures
            items={[t("billing_feature_free"), t("billing_feature_voice"), t("billing_feature_ai")]}
          />
          <p className="text-sm text-muted-foreground">{t("billing_metered_hint")}</p>
          <Button
            className="mt-auto w-full whitespace-normal"
            disabled={disabled}
            onClick={onManage}
          >
            {t(free ? "billing_subscribe" : "billing_manage")}
            <ArrowUpRight className="size-4" />
          </Button>
        </div>
      </div>
      {!free && (
        <div className="rounded-lg bg-secondary/40 p-4 text-sm">
          <p className="font-medium">{t("billing_cancel_how")}</p>
          <p className="mt-1 text-muted-foreground">{t("billing_cancel_steps")}</p>
        </div>
      )}
      {children}
      {financial.priceUnavailable && (
        <p role="alert" className="text-sm text-destructive">
          {t("billing_price_unavailable")}
        </p>
      )}
      {!financial.configured && (
        <p className="text-sm text-muted-foreground">{t("billing_not_configured")}</p>
      )}
    </section>
  );
}
