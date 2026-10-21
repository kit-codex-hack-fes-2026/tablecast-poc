import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ReceiptText, RefreshCw } from "lucide-react";
import { type ReactNode } from "react";
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
import { Invoices } from "./billing-invoices";
import { billingSearchSchema } from "./billing-model";
import { MonthlyUsage } from "./billing-monthly-usage";
import { type Billing, billingOptions } from "./billing-query";
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
      <ErrorNotice error={billing.error} onRetry={() => void billing.refetch()} />
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
  const usage = (
    <MonthlyUsage data={data} periodControl={periodControl} dailyCollection={dailyCollection} />
  );
  return data.financial ? (
    <ContractSection financial={data.financial} organizationId={data.organization.id}>
      {usage}
    </ContractSection>
  ) : (
    usage
  );
}
