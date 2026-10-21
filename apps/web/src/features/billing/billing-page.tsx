import * as Disclosure from "../../components/ui/disclosure";
import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  AudioLines,
  CalendarDays,
  Check,
  CircleCheck,
  Clock,
  Coins,
  FileDown,
  Hash,
  MessageSquare,
  RefreshCw,
  ReceiptText,
  TableProperties,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { MonthPicker } from "../../components/month-picker";
import { PageHeader } from "../../components/page-header";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCollectionSearch } from "../shell/collection-search";
import { billingSearchSchema } from "./billing-model";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { AdminShell } from "../shell/admin-shell";
import { storesOptions } from "../store/store-query";
import { BillingUsageChart } from "./billing-usage-chart";
import { billingOptions, invoiceOptions, type Billing, type Invoice } from "./billing-query";

const yen = {
  ja: new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 2,
  }),
  en: new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 2,
  }),
};
const months = {
  ja: new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", timeZone: "UTC" }),
  en: new Intl.DateTimeFormat("en-GB", { year: "numeric", month: "long", timeZone: "UTC" }),
};
const billingMoney = (value: number, locale: ReturnType<typeof useI18n>["locale"]) =>
  yen[locale].format(value).replace("￥", "¥");

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
    <AdminShell
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
    </AdminShell>
  );
}

export function BillingOverview({
  data,
  periodControl,
  dailyCollection,
}: {
  data: Billing;
  periodControl?: ReactNode;
  dailyCollection?: ReturnType<typeof useCollectionSearch>;
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

function MonthlyUsage({
  data,
  periodControl,
  dailyCollection,
}: {
  data: Billing;
  periodControl?: ReactNode;
  dailyCollection?: ReturnType<typeof useCollectionSearch>;
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

function ContractSection({
  financial,
  organizationId,
  children,
}: {
  financial: NonNullable<Billing["financial"]>;
  organizationId: string;
  children: ReactNode;
}) {
  const free = financial.checkoutRequired;
  const action = useMutation({
    mutationFn: async () => {
      if (!financial.configured || !financial.checkoutPlan) return;
      const returnUrl = `${window.location.origin}/billing/${encodeURIComponent(organizationId)}`;
      const result = !free
        ? await authClient.subscription.billingPortal({
            referenceId: organizationId,
            customerType: "organization",
            returnUrl,
            disableRedirect: true,
          })
        : await authClient.subscription.upgrade({
            plan: financial.checkoutPlan,
            referenceId: organizationId,
            customerType: "organization",
            successUrl: returnUrl,
            cancelUrl: returnUrl,
            returnUrl,
            disableRedirect: true,
          });
      const target = authResult(result);
      if (target.url) window.location.assign(target.url);
    },
  });
  const disabled = !financial.configured || action.isPending;
  return (
    <>
      <CurrentPlan financial={financial} />
      {children}
      <PlanOptions financial={financial} disabled={disabled} onManage={() => action.mutate()}>
        <ErrorNotice error={action.error} onRetry={() => action.mutate()} />
      </PlanOptions>
    </>
  );
}
function PlanOptions({
  financial,
  disabled,
  onManage,
  children,
}: {
  financial: NonNullable<Billing["financial"]>;
  disabled: boolean;
  onManage: () => void;
  children: ReactNode;
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

function CurrentPlan({ financial }: { financial: NonNullable<Billing["financial"]> }) {
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

function PlanFeatures({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2 text-sm">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 wrap-break-word text-2xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="mt-2 text-sm text-muted-foreground">{detail}</p>}
    </div>
  );
}
function UsageTable({
  data,
  canManage,
  pending,
  collection,
  filtersActive,
  onReset,
}: {
  data: Billing["visits"];
  canManage: boolean;
  pending: boolean;
  collection: ReturnType<typeof useCollectionSearch>;
  filtersActive: boolean;
  onReset: () => void;
}) {
  const { t, locale } = useI18n();
  const columns = useMemo(() => usageColumns(t, locale, canManage), [t, locale, canManage]);
  return (
    <DataTable
      {...collection}
      filtersActive={filtersActive}
      onReset={onReset}
      searchLabel={t("billing_filter")}
      searchPlaceholder={t("billing_filter")}
      manualFiltering
      tableLabel={t("billing_usage")}
      data={data}
      columns={columns}
      getRowId={(row) => row.id}
      pagination={false}
      pending={pending}
      empty={t("billing_empty")}
    />
  );
}
function usageColumns(
  t: ReturnType<typeof useI18n>["t"],
  locale: ReturnType<typeof useI18n>["locale"],
  canManage: boolean,
): DataTableColumn<Billing["visits"][number]>[] {
  return [
    {
      id: "tableName",
      accessorFn: (row) => (row.demo ? t("demo_title") : (row.tableName ?? "")),
      meta: { icon: TableProperties },
      header: t("admin_table"),
      cell: ({ row }) => (row.original.demo ? t("demo_title") : (row.original.tableName ?? "—")),
    },
    {
      accessorKey: "startedAt",
      meta: { icon: CalendarDays },
      header: t("admin_visit_started"),
      cell: ({ row }) => (
        <div>
          <DateTime value={row.original.startedAt} />
        </div>
      ),
    },
    {
      accessorKey: "seconds",
      meta: { align: "right", icon: AudioLines },
      header: t("billing_voice"),
      cell: ({ row }) =>
        `${(row.original.seconds / 60).toLocaleString(locale, { maximumFractionDigits: 1 })} ${t("billing_minutes")}`,
    },
    {
      accessorKey: "responses",
      meta: { align: "right", icon: MessageSquare },
      header: t("billing_responses"),
    },
    {
      id: "tokens",
      accessorFn: (row) => row.inputTokens + row.outputTokens,
      meta: { align: "right", icon: Hash },
      header: t("billing_text_usage"),
      cell: ({ row }) => (
        <Disclosure.Root>
          <Disclosure.Trigger className="cursor-pointer text-sm underline underline-offset-4">
            {t("admin_details")}
          </Disclosure.Trigger>
          <Disclosure.Panel>
            <dl className="mt-2 min-w-36 space-y-2 text-xs">
              <div>
                <dt className="text-muted-foreground">{t("billing_input_tokens")}</dt>
                <dd className="tabular-nums">{row.original.inputTokens.toLocaleString(locale)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("billing_output_tokens")}</dt>
                <dd className="tabular-nums">{row.original.outputTokens.toLocaleString(locale)}</dd>
              </div>
            </dl>
          </Disclosure.Panel>
        </Disclosure.Root>
      ),
    },
    ...(canManage
      ? [
          {
            id: "charge",
            accessorFn: (row: Billing["visits"][number]) =>
              "chargeMicros" in row ? row.chargeMicros : undefined,
            meta: { align: "right" as const, icon: Coins },
            header: t("billing_estimate"),
            cell: ({ row }: { row: { original: Billing["visits"][number] } }) =>
              "chargeMicros" in row.original
                ? billingMoney(row.original.chargeMicros / 1e6, locale)
                : "—",
          },
        ]
      : []),
  ];
}

function Invoices({ organizationId }: { organizationId: string }) {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const cursors = useLocation({
    select: (location) => billingSearchSchema.parse(location.search).invoiceCursors ?? [],
  });
  const collection = useCollectionSearch({
    prefix: "invoices",
    sortIds: ["createdAt", "number", "period", "amount", "status"],
  });
  const setCursors = (value: string[]) =>
    void navigate({
      to: ".",
      resetScroll: false,
      search: (previous) => ({
        ...previous,
        invoiceCursors: value.length ? value : undefined,
        invoicesPage: undefined,
      }),
    });
  const invoices = useQuery(invoiceOptions(organizationId, cursors.at(-1)));
  const columns = useMemo(() => invoiceColumns(t, locale), [t, locale]);
  return (
    <section className="space-y-4" aria-labelledby="tablecast-billing-invoices">
      <h2 id="tablecast-billing-invoices" className="text-xl font-semibold">
        {t("billing_invoices")}
      </h2>
      <DataTable
        {...collection}
        searchLabel={t("billing_invoice_search")}
        searchPlaceholder={t("billing_invoice_search")}
        tableLabel={t("billing_invoices")}
        data={invoices.data?.invoices ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        pagination={false}
        pending={invoices.isFetching}
        error={invoices.error}
        onRetry={() => void invoices.refetch()}
        empty={t("billing_invoices_empty")}
      />
      <p className="text-sm text-muted-foreground">{t("billing_invoice_loaded_search")}</p>
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={cursors.length === 0 || invoices.isFetching}
          onClick={() => setCursors(cursors.slice(0, -1))}
        >
          <ChevronLeft />
          {t("billing_previous")}
        </Button>
        <Button
          variant="outline"
          disabled={!invoices.data?.next || invoices.isFetching}
          onClick={() => {
            if (invoices.data?.next) setCursors([...cursors, invoices.data.next]);
          }}
        >
          {t("billing_next")}
          <ChevronRight />
        </Button>
      </div>
    </section>
  );
}

function invoiceColumns(
  t: ReturnType<typeof useI18n>["t"],
  locale: ReturnType<typeof useI18n>["locale"],
): DataTableColumn<Invoice>[] {
  return [
    {
      accessorKey: "createdAt",
      meta: { icon: CalendarDays },
      header: t("billing_issued"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    { accessorKey: "number", header: t("billing_number"), meta: { icon: Hash } },
    {
      id: "period",
      accessorFn: (row) => row.periodStart,
      meta: { icon: Clock },
      header: t("billing_invoice_period"),
      cell: ({ row }) => (
        <span>
          <DateTime value={row.original.periodStart} /> –{" "}
          <DateTime value={row.original.periodEnd} />
        </span>
      ),
    },
    {
      accessorKey: "amount",
      meta: { align: "right", icon: Coins },
      header: t("billing_amount"),
      cell: ({ row }) =>
        row.original.amount === null ? "—" : billingMoney(row.original.amount, locale),
    },
    {
      accessorKey: "status",
      meta: { icon: CircleCheck },
      header: t("billing_payment_status"),
      cell: ({ row }) =>
        t(
          row.original.status === "paid"
            ? "billing_paid"
            : row.original.status === "void"
              ? "billing_void"
              : row.original.status === "uncollectible"
                ? "billing_uncollectible"
                : row.original.status === "draft"
                  ? "billing_draft"
                  : "billing_open",
        ),
    },
    {
      id: "links",
      header: t("billing_invoice"),
      cell: ({ row }) => (
        <div className="flex gap-3">
          {row.original.url && (
            <a
              className="inline-flex min-h-11 items-center gap-1 underline"
              href={row.original.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("billing_invoice")}
              <ArrowUpRight className="size-4" />
            </a>
          )}
          {row.original.pdf && (
            <a
              className="inline-flex min-h-11 items-center underline"
              href={row.original.pdf}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileDown className="mr-1 size-4" />
              PDF
            </a>
          )}
        </div>
      ),
    },
  ];
}
