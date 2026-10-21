import { type ReactNode } from "react";
import type { useCollectionSearch } from "../shell/collection-search";
import { DateTime } from "../../components/date-time";
import { useI18n } from "../../i18n/locale";
import { months } from "./billing-format";
import { type Billing } from "./billing-query";
import { BillingUsageChart } from "./billing-usage-chart";

export function MonthlyUsage({
  data,
  periodControl,
  dailyCollection,
}: {
  dailyCollection?: ReturnType<typeof useCollectionSearch>;
  data: Billing;
  periodControl?: ReactNode;
}) {
  const { t, locale } = useI18n();
  const state = data.usage.aiState;
  const monthTitle = months[locale].format(data.period.start);
  return (
    <>
      {state !== "ready" && !data.financial?.checkoutRequired && (
        <div role="status" className="rounded-xl border border-border bg-secondary/40 p-4">
          <p className="font-medium">
            {t(state === "failed" ? "billing_ai_failed" : "billing_ai_pending")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{t("billing_ai_hint")}</p>
        </div>
      )}
      <section className="space-y-5" aria-labelledby="tablecast-billing-monthly">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="tablecast-billing-monthly" className="text-xl font-semibold">
              {t("billing_monthly_usage")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {monthTitle} · {t("billing_calendar_hint")}
            </p>
          </div>
          {periodControl}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Metric
            label={t("billing_voice")}
            value={`${(data.usage.seconds / 60).toLocaleString(locale, { maximumFractionDigits: 1 })} ${t("billing_minutes")}`}
            detail={t("billing_voice_hint")}
          />
          <Metric
            label={t("billing_responses")}
            value={data.usage.responses.toLocaleString(locale)}
            detail={t("billing_responses_hint")}
          />
        </div>
        <BillingUsageChart data={data} collection={dailyCollection} />
        <section className="rounded-2xl bg-surface-subtle p-4">
          <h3 className="text-sm font-medium">{t("billing_token_details")}</h3>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{t("billing_tokens_hint")}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Metric
              label={t("billing_input_tokens")}
              value={data.usage.inputTokens.toLocaleString(locale)}
              detail={`${t("billing_cached_tokens")}: ${data.usage.cachedTokens.toLocaleString(locale)}`}
            />
            <Metric
              label={t("billing_output_tokens")}
              value={data.usage.outputTokens.toLocaleString(locale)}
              detail={t("billing_output_hint")}
            />
          </div>
        </section>
        <p className="text-sm text-muted-foreground">
          {t("billing_updated")}: <DateTime value={data.updatedAt} />
          {data.usage.unconfirmed > 0 &&
            ` · ${t("billing_unconfirmed")}: ${data.usage.unconfirmed}`}
        </p>
      </section>
    </>
  );
}

export function Metric({
  label,
  value,
  detail,
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 wrap-break-word text-2xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}
    </div>
  );
}
