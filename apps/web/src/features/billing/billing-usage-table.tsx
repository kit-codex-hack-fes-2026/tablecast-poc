import {
  AudioLines,
  CalendarDays,
  Coins,
  Hash,
  MessageSquare,
  TableProperties,
} from "lucide-react";
import { useMemo } from "react";
import type { useCollectionSearch } from "../shell/collection-search";
import { DataTable } from "../../components/data-table";
import { type DataTableColumn } from "../../components/data-table-model";
import { DateTime } from "../../components/date-time";
import * as Disclosure from "../../components/ui/disclosure";
import { useI18n } from "../../i18n/locale";
import { billingMoney } from "./billing-format";
import { type Billing } from "./billing-query";

export function UsageTable({
  data,
  canManage,
  pending,
  collection,
  filtersActive,
  onReset,
}: {
  canManage: boolean;
  collection: ReturnType<typeof useCollectionSearch>;
  data: Billing["visits"];
  filtersActive: boolean;
  onReset: () => void;
  pending: boolean;
}) {
  const { t, locale } = useI18n();
  const columns = useMemo(() => usageColumns(t, locale, canManage), [t, locale, canManage]);
  return (
    <DataTable
      defaultSort={{ id: "startedAt", desc: true }}
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
      meta: { icon: TableProperties, sortLabel: t("collection_table_name") },
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
