import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Coins,
  FileDown,
  Hash,
} from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { DateTime } from "../../components/date-time";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { useCollectionSearch } from "../shell/collection-search";
import { billingMoney } from "./billing-format";
import { billingSearchSchema } from "./billing-model";
import { type Invoice, invoiceOptions } from "./billing-query";

export function Invoices({ organizationId }: { organizationId: string }) {
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
        defaultSort={{ id: "createdAt", desc: true }}
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
