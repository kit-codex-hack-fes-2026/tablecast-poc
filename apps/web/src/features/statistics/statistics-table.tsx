import type { StatisticsResult } from "@tablecast/api/schema";
import { resolveLocalized } from "@tablecast/api/localization";
import { Hash, Layers, Package, Percent, Users } from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { useI18n } from "../../i18n/locale";
import { useCollectionSearch } from "../shell/collection-search";

const percentages = {
  ja: new Intl.NumberFormat("ja-JP", { style: "percent", maximumFractionDigits: 1 }),
  en: new Intl.NumberFormat("en-GB", { style: "percent", maximumFractionDigits: 1 }),
};

export function StatisticsTable({
  rows,
  view,
  pending = false,
}: {
  pending?: boolean;
  rows: StatisticsResult["rows"];
  view: "modifiers" | "products";
}) {
  const { t, locale } = useI18n();
  const collection = useCollectionSearch({
    prefix: view,
    sortIds: ["name", "quantity", "orderingSessions", "orderRate", "planCoveredQuantity"],
  });
  const columns = useMemo(() => statisticsColumns(t, locale, view), [t, locale, view]);
  return (
    <DataTable
      defaultSort={{ id: "name", desc: false }}
      {...collection}
      pending={pending}
      data={rows}
      columns={columns}
      getRowId={(row) => `${row.productId}:${row.optionId}`}
      pagination={false}
      tableLabel={t("statistics_table")}
      searchLabel={t("statistics_item")}
      searchPlaceholder={t("collection_search_statistics_placeholder")}
    />
  );
}

function statisticsColumns(
  t: ReturnType<typeof useI18n>["t"],
  locale: ReturnType<typeof useI18n>["locale"],
  view: "modifiers" | "products",
): DataTableColumn<StatisticsResult["rows"][number]>[] {
  return [
    {
      accessorKey: "name",
      header: t("statistics_item"),
      meta: { icon: Package, rowHeader: true },
      cell: ({ row }) => (
        <span className="block min-w-48 max-w-96 whitespace-normal font-medium">
          {row.original.name ?? t("statistics_unknown")}
        </span>
      ),
    },
    {
      accessorKey: "quantity",
      header: () => (
        <>
          <span>{t("statistics_quantity")}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {t(
              view === "modifiers" ? "statistics_option_quantity_hint" : "statistics_quantity_hint",
            )}
          </span>
        </>
      ),
      meta: { align: "right", icon: Hash, sortLabel: t("statistics_quantity") },
      cell: ({ row }) => row.original.quantity.toLocaleString(locale),
    },
    {
      accessorKey: "orderingSessions",
      header: t("statistics_orderingSessions"),
      meta: { align: "right", icon: Users },
      cell: ({ row }) => row.original.orderingSessions.toLocaleString(locale),
    },
    {
      accessorKey: "orderRate",
      header: () => (
        <>
          <span>{t("statistics_orderRate")}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {t("statistics_rate_basis")}
          </span>
        </>
      ),
      meta: { align: "right", icon: Percent, sortLabel: t("statistics_orderRate") },
      cell: ({ row }) =>
        row.original.orderRate === null
          ? t("statistics_unavailable")
          : resolveLocalized(percentages, locale).format(row.original.orderRate),
    },
    {
      accessorKey: "planCoveredQuantity",
      header: t("statistics_planCoveredQuantity"),
      meta: { align: "right", icon: Layers },
      cell: ({ row }) => row.original.planCoveredQuantity.toLocaleString(locale),
    },
  ];
}
