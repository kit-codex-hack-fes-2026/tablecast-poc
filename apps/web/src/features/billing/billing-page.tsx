import { resolveLocalized } from "@tablecast/api/localization";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ReceiptText, RefreshCw } from "lucide-react";
import { type ReactNode } from "react";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { MonthPicker } from "../../components/month-picker";
import { PageHeader } from "../../components/page-header";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { useCollectionSearch } from "../shell/collection-search";
import { StoreAdminShell } from "../store/admin-shell";
import { storesOptions } from "../store/store-query";
import { ContractSection } from "./billing-contract";
import { months } from "./billing-format";
import { Invoices } from "./billing-invoices";
import { billingSearchSchema } from "./billing-model";
import { Metric } from "./billing-plan-options";
import { type Billing, billingOptions } from "./billing-query";
import { BillingUsageChart } from "./billing-usage-chart";
import { UsageTable } from "./billing-usage-table";

export function BillingPage({ organizationId }: { organizationId: string }) {
  const { t } = useI18n();
  const stores = useQuery(storesOptions);
  const availableStores = stores.data?.stores ?? [];
  const selectedStore = availableStores.find((store) => store.organizationId === organizationId);
  const navigate = useNavigate();
  const search = useLocation({ select: (location) => billingSearchSchema.parse(location.search) });
  const usage = useCollectionSearch({
    prefix: "usage",
    sortIds: ["tableName", "startedAt", "seconds", "responses", "tokens", "charge"],
  });
  const daily = useCollectionSearch({ prefix: "daily", sortIds: ["day", "amount"] });
  const month = search.month;
  const resetUsage = () =>
    void navigate({
      to: ".",
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        month: undefined,
        usageQ: undefined,
        usageSort: undefined,
        usagePage: undefined,
      }),
    });
  const billing = useInfiniteQuery(
    billingOptions(organizationId, month, usage.state.globalFilter || undefined),
  );
  const data = billing.data?.pages[0];
  return (
    <StoreAdminShell
      tab="billing"
      storeId={data?.storeId}
      storeName={selectedStore?.name ?? data?.organization.name}
      organizationId={organizationId}
    >
      <PageHeader
        title={t("billing_title")}
        icon={<ReceiptText />}
        actions={
          <Button
            variant="outline"
            aria-label={t("billing_refresh")}
            disabled={billing.isFetching}
            onClick={() => void billing.refetch()}
          >
            <RefreshCw className="size-4" />
            {t("billing_refresh")}
          </Button>
        }
      />
      <ErrorNotice query={billing} />
      {!data && billing.isPending ? (
        <LoadingState />
      ) : (
        data && (
          <>
            <BillingOverview
              data={data}
              dailyCollection={daily}
              periodControl={
                <MonthPicker
                  label={t("billing_month")}
                  value={month || data.month}
                  onChange={(value) => {
                    void navigate({
                      to: ".",
                      resetScroll: false,
                      search: (previous) => ({ ...previous, month: value, usagePage: undefined }),
                    });
                  }}
                />
              }
            />
            <section className="space-y-4" aria-labelledby="tablecast-billing-usage">
              <div>
                <h2 id="tablecast-billing-usage" className="text-xl font-semibold">
                  {t("billing_usage")}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">{t("billing_usage_hint")}</p>
              </div>
              <UsageTable
                collection={usage}
                filtersActive={Boolean(month)}
                onReset={resetUsage}
                data={billing.data?.pages.flatMap((page) => page.visits) ?? []}
                canManage={data.canManage}
                pending={billing.isFetching}
              />
              <p className="text-sm text-muted-foreground">{t("billing_loaded_sort")}</p>
              {billing.hasNextPage && (
                <Button
                  variant="outline"
                  disabled={billing.isFetching}
                  onClick={() => void billing.fetchNextPage()}
                >
                  <ArrowDown />
                  {t("billing_more")}
                </Button>
              )}
            </section>
            {data.financial && <Invoices key={organizationId} organizationId={organizationId} />}
          </>
        )
      )}
    </StoreAdminShell>
  );
}
export function BillingOverview({
  data,
  periodControl,
  dailyCollection,
}: {
  dailyCollection?: ReturnType<typeof useCollectionSearch>;
  data: Billing;
  periodControl?: ReactNode;
}) {
  const { t, locale } = useI18n();
  function renderUsage() {
    const state = data.usage.aiState;
    const monthTitle = resolveLocalized(months, locale).format(data.period.start);
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
            <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
              {t("billing_tokens_hint")}
            </p>
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
  const usage = renderUsage();
  return data.financial ? (
    <ContractSection financial={data.financial} organizationId={data.organization.id}>
      {usage}
    </ContractSection>
  ) : (
    usage
  );
}
