import { uiLocale } from "@tablecast/api/localization";
import { type ReactTable, type RowData } from "@tanstack/react-table";
import { ArrowDownUp, ChevronLeft, ChevronRight, List } from "lucide-react";
import { type ReactNode } from "react";
import type { features } from "./data-table-model";
import { useI18n } from "../i18n/locale";
import { m } from "../paraglide/messages";
import { CollectionSort } from "./collection-sort";
import { CollectionToolbar } from "./collection-toolbar";
import { Button } from "./ui/button";

export function TableControls<T extends RowData>({
  table,
  sourceOrderLabel,
  sortingActive,
  searchLabel,
  searchPlaceholder,
  searchValue,
  filters,
  filtersActive,
  pending,
  onReset,
  resetPageOnSearch,
  resetPageOnSort,
}: {
  filters?: ReactNode;
  filtersActive: boolean;
  onReset?: () => void;
  pending: boolean;
  resetPageOnSearch: boolean;
  resetPageOnSort: boolean;
  searchLabel?: string;
  searchPlaceholder?: string;
  searchValue: string;
  sortingActive: boolean;
  sourceOrderLabel?: string;
  table: ReactTable<typeof features, T>;
}) {
  const { t } = useI18n();
  const sortable = table
    .getAllLeafColumns()
    .filter(
      (column) =>
        column.getCanSort() &&
        (column.columnDef.meta?.sortLabel || typeof column.columnDef.header === "string"),
    );
  const sorting = table.state.sorting[0];
  const hasCriteria = !!searchValue || filtersActive || sortingActive;
  function resetCriteria() {
    if (onReset) onReset();
    else {
      table.resetSorting();
      table.setGlobalFilter("");
      table.setPageIndex(0);
    }
  }
  if (!searchLabel && !filters && sortable.length === 0) return null;
  return (
    <CollectionToolbar
      disabled={pending}
      search={
        searchLabel
          ? {
              label: searchLabel,
              placeholder: searchPlaceholder ?? searchLabel,
              value: searchValue,
              onChange: (value) => {
                table.setGlobalFilter(value);
                if (resetPageOnSearch) table.setPageIndex(0);
              },
            }
          : undefined
      }
      filters={filters}
      sort={
        sortable.length > 0 && (
          <CollectionSort
            disabled={pending}
            value={sorting ? `${sorting.id}:${sorting.desc ? "desc" : "asc"}` : ""}
            onValueChange={(option) => {
              const column = sortable.find(
                (item) => option === `${item.id}:asc` || option === `${item.id}:desc`,
              );
              table.setSorting(
                column ? [{ id: column.id, desc: option === `${column.id}:desc` }] : [],
              );
              if (resetPageOnSort) table.setPageIndex(0);
            }}
            options={[
              ...(sourceOrderLabel ? [{ value: "", label: sourceOrderLabel, icon: List }] : []),
              ...sortable.flatMap((column) =>
                [false, true].map((desc) => ({
                  value: `${column.id}:${desc ? "desc" : "asc"}`,
                  label: `${column.columnDef.meta?.sortLabel ?? String(column.columnDef.header)} · ${t(desc ? "collection_sort_descending" : "collection_sort_ascending")}`,
                  icon: column.columnDef.meta?.icon ?? ArrowDownUp,
                })),
              ),
            ]}
          />
        )
      }
      onReset={resetCriteria}
      resetDisabled={!hasCriteria}
    />
  );
}

export function TablePagination<T extends RowData>({
  table,
  pending,
}: {
  pending: boolean;
  table: ReactTable<typeof features, T>;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {pending
          ? t("common_loading")
          : m.common_result_count(
              { count: table.getFilteredRowModel().rows.length },
              { locale: uiLocale(locale) },
            )}
      </span>
      <div className="flex items-center gap-2">
        <Button
          size="icon"
          variant="outline"
          aria-label={t("common_previous_page")}
          disabled={pending || !table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-16 text-center tabular-nums">
          {table.state.pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
        </span>
        <Button
          size="icon"
          variant="outline"
          aria-label={t("common_next_page")}
          disabled={pending || !table.getCanNextPage()}
          onClick={() => table.nextPage()}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
