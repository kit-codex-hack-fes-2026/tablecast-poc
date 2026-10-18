import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { DataTable, type DataTableColumn } from "../../components/data-table";
import { DateTime } from "../../components/date-time";
import { ErrorNotice } from "../../components/error-notice";
import { LoadingState } from "../../components/loading-state";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useI18n } from "../../i18n/locale";
import { authClient, authResult } from "../../lib/auth-client";
import { AdminShell } from "../shell/admin-shell";
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
const billingMoney = (value: number, locale: ReturnType<typeof useI18n>["locale"]) =>
  yen[locale].format(value).replace("￥", "¥");
const billingStatuses: Record<string, "billing_active" | "billing_past_due" | "billing_canceled"> =
  {
    active: "billing_active",
    past_due: "billing_past_due",
    canceled: "billing_canceled",
  };
export function BillingPage({ organizationId }: { organizationId: string }) {
  const { t } = useI18n();
  const [month, setMonth] = useState("");
  const [search, setSearch] = useState("");
  const billing = useInfiniteQuery(
    billingOptions(organizationId, month || undefined, search || undefined),
  );
  const data = billing.data?.pages[0];
  return (
    <AdminShell
      tab="billing"
      storeId={data?.storeId}
      organizationId={organizationId}
      header={t("billing_title")}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t("billing_title")}</h1>
          <p className="mt-1 text-muted-foreground">{data?.organization.name}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            {t("billing_month")}
            <Input
              type="month"
              value={month || data?.month || ""}
              onChange={(event) => {
                setMonth(event.target.value);
                setSearch("");
              }}
            />
          </label>
          <Button
            variant="outline"
            aria-label={t("billing_refresh")}
            disabled={billing.isFetching}
            onClick={() => void billing.refetch()}
          >
            <RefreshCw className="size-4" />
            {t("billing_refresh")}
          </Button>
        </div>
      </div>
      <ErrorNotice error={billing.error} onRetry={() => void billing.refetch()} />
      {!data && billing.isPending ? (
        <LoadingState />
      ) : (
        data && (
          <>
            <BillingOverview data={data} />
            <section className="space-y-4" aria-labelledby="tablecast-billing-usage">
              <h2 id="tablecast-billing-usage" className="text-xl font-semibold">
                {t("billing_usage")}
              </h2>
              <label className="block max-w-sm space-y-1 text-sm">
                {t("billing_filter")}
                <Input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <UsageTable
                data={billing.data?.pages.flatMap((page) => page.visits) ?? []}
                canManage={data.canManage}
                pending={billing.isFetching}
              />
              {billing.hasNextPage && (
                <Button
                  variant="outline"
                  disabled={billing.isFetching}
                  onClick={() => void billing.fetchNextPage()}
                >
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

export function BillingOverview({ data }: { data: Billing }) {
  const { t, locale } = useI18n();
  const state = data.usage.aiState;
  return (
    <>
      <div role="status" className="rounded-xl border border-border bg-secondary/40 p-4">
        <p className="font-medium">
          {t(
            state === "ready"
              ? "billing_ai_ready"
              : state === "failed"
                ? "billing_ai_failed"
                : "billing_ai_pending",
          )}
        </p>
        {state !== "ready" && (
          <p className="mt-1 text-sm text-muted-foreground">{t("billing_ai_hint")}</p>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label={t("billing_voice")}
          value={`${(data.usage.seconds / 60).toLocaleString(locale, { maximumFractionDigits: 1 })} ${t("billing_minutes")}`}
        />
        <Metric
          label={t("billing_responses")}
          value={data.usage.responses.toLocaleString(locale)}
        />
        <Metric
          label={t("billing_input_tokens")}
          value={data.usage.inputTokens.toLocaleString(locale)}
          detail={`${t("billing_cached_tokens")}: ${data.usage.cachedTokens.toLocaleString(locale)}`}
        />
        <Metric
          label={t("billing_output_tokens")}
          value={data.usage.outputTokens.toLocaleString(locale)}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {t("billing_period_hint")} · {t("billing_updated")}: <DateTime value={data.updatedAt} />
        {data.usage.unconfirmed > 0 && ` · ${t("billing_unconfirmed")}: ${data.usage.unconfirmed}`}
      </p>
      {data.financial && (
        <ContractSection financial={data.financial} organizationId={data.organization.id} />
      )}
    </>
  );
}
function ContractSection({
  financial,
  organizationId,
}: {
  financial: NonNullable<Billing["financial"]>;
  organizationId: string;
}) {
  const { t, locale } = useI18n();
  const action = useMutation({
    mutationFn: async () => {
      if (!financial?.configured || !financial.checkoutPlan) return;
      const returnUrl = `${window.location.origin}/billing/${encodeURIComponent(organizationId)}`;
      const result = !financial.checkoutRequired
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
  return (
    <section
      className="space-y-4 rounded-xl border border-border p-5"
      aria-labelledby="tablecast-billing-contract"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="tablecast-billing-contract" className="text-xl font-semibold">
            {t("billing_contract")}
          </h2>
          <p className="mt-1 text-muted-foreground">
            {t(
              financial.subscription
                ? (billingStatuses[financial.subscription.status] ?? "billing_inactive")
                : "billing_no_contract",
            )}
          </p>
        </div>
        <Button
          disabled={!financial.configured || action.isPending}
          onClick={() => action.mutate()}
        >
          {financial.checkoutRequired ? t("billing_subscribe") : t("billing_manage")}
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
      <ErrorNotice error={action.error} onRetry={() => action.mutate()} />
      {financial.priceUnavailable && (
        <p role="alert" className="text-sm text-destructive">
          {t("billing_price_unavailable")}
        </p>
      )}
      {!financial.configured && (
        <p className="text-sm text-muted-foreground">{t("billing_not_configured")}</p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Metric
          label={t("billing_base")}
          value={financial.monthlyBase === null ? "—" : billingMoney(financial.monthlyBase, locale)}
        />
        <Metric
          label={t("billing_estimate")}
          value={billingMoney(financial.chargeMicros / 1e6, locale)}
          detail={t("billing_estimate_hint")}
        />
      </div>
      {financial.subscription?.periodStart && financial.subscription.periodEnd && (
        <p className="text-sm text-muted-foreground">
          {t("billing_cycle")}: <DateTime value={financial.subscription.periodStart} /> –{" "}
          <DateTime value={financial.subscription.periodEnd} />
          {financial.subscription.cancelAtPeriodEnd && ` · ${t("billing_cancel_scheduled")}`}
        </p>
      )}
    </section>
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
}: {
  data: Billing["visits"];
  canManage: boolean;
  pending: boolean;
}) {
  const { t, locale } = useI18n();
  const columns = useMemo(() => usageColumns(t, locale, canManage), [t, locale, canManage]);
  return (
    <DataTable
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
      accessorKey: "tableName",
      header: t("admin_table"),
      cell: ({ row }) => (row.original.demo ? t("demo_title") : (row.original.tableName ?? "—")),
    },
    {
      accessorKey: "sessionId",
      header: t("billing_visit"),
      cell: ({ row }) => (
        <span className="block max-w-48 truncate" title={row.original.sessionId}>
          {row.original.sessionId}
        </span>
      ),
    },
    {
      accessorKey: "startedAt",
      header: t("admin_visit_started"),
      cell: ({ row }) => <DateTime value={row.original.startedAt} />,
    },
    {
      accessorKey: "seconds",
      header: t("billing_voice"),
      cell: ({ row }) =>
        `${(row.original.seconds / 60).toLocaleString(locale, { maximumFractionDigits: 1 })} ${t("billing_minutes")}`,
    },
    { accessorKey: "responses", header: t("billing_responses") },
    { accessorKey: "inputTokens", header: t("billing_input_tokens") },
    { accessorKey: "outputTokens", header: t("billing_output_tokens") },
    ...(canManage
      ? [
          {
            id: "charge",
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
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const invoices = useQuery(invoiceOptions(organizationId, cursors.at(-1)));
  const columns = useMemo(() => invoiceColumns(t, locale), [t, locale]);
  return (
    <section className="space-y-4" aria-labelledby="tablecast-billing-invoices">
      <h2 id="tablecast-billing-invoices" className="text-xl font-semibold">
        {t("billing_invoices")}
      </h2>
      <DataTable
        data={invoices.data?.invoices ?? []}
        columns={columns}
        getRowId={(row) => row.id}
        pagination={false}
        pending={invoices.isFetching}
        error={invoices.error}
        onRetry={() => void invoices.refetch()}
        empty={t("billing_invoices_empty")}
      />
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={cursors.length === 1 || invoices.isFetching}
          onClick={() => setCursors((value) => value.slice(0, -1))}
        >
          {t("billing_previous")}
        </Button>
        <Button
          variant="outline"
          disabled={!invoices.data?.next || invoices.isFetching}
          onClick={() => setCursors((value) => [...value, invoices.data?.next ?? undefined])}
        >
          {t("billing_next")}
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
      header: t("billing_issued"),
      cell: ({ row }) => <DateTime value={row.original.createdAt} />,
    },
    { accessorKey: "number", header: t("billing_number") },
    {
      id: "period",
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
      header: t("billing_amount"),
      cell: ({ row }) =>
        row.original.amount === null ? "—" : billingMoney(row.original.amount, locale),
    },
    {
      accessorKey: "status",
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
              PDF
            </a>
          )}
        </div>
      ),
    },
  ];
}
