import {
  flexRender,
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ReactTable,
  type PaginationState,
  type OnChangeFn,
  type RowData,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n/locale";
import { m } from "../paraglide/messages";
import { ErrorNotice } from "./error-notice";
import { Skeleton } from "./ui/skeleton";

import { Button } from "./ui/button";
import { NativeSelect } from "./ui/native-select";
import { CollectionToolbar } from "./collection-toolbar";
import { Table, TableCell, TableHead } from "./ui/table";

const columnMeta: { align?: "left" | "right" } = {};
const features = tableFeatures({
  columnMeta,
  columnFilteringFeature,
  columnVisibilityFeature,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  sortedRowModel: createSortedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
});

export type DataTableColumn<T extends RowData> = ColumnDef<typeof features, T>;

/**
 * 検索・ページ分割を備えた一覧。
 * data、columns、getRowIdが必須。
 * searchLabelで検索名、emptyで0件文、pending/error/onRetryで取得状態を指定する。
 * stateとonGlobalFilterChange/onPaginationChangeでURL等へ同期できる。
 * 部分取得ではpagination=false、manualFilteringを実際のAPIに合わせる。
 * 取得した一部だけを全件集計と呼ばない。
 * 数値列はmeta.align=rightで見出しと値を右揃えにする。
 * 行全体をクリック領域にせず、対象名へリンクを置く。
 */
export function DataTable<T extends RowData>({
  data,
  columns,
  getRowId,
  searchLabel,
  empty,
  pagination = true,
  pending = false,
  error,
  onRetry,
  state,
  onGlobalFilterChange,
  onPaginationChange,
  manualFiltering,
  filters,
  filtersActive = false,
  onReset,
}: {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  searchLabel?: string;
  empty?: string;
  pagination?: boolean;
  pending?: boolean;
  error?: unknown;
  onRetry?: () => void;
  state?: { globalFilter?: string; pagination?: PaginationState };
  onGlobalFilterChange?: OnChangeFn<string>;
  onPaginationChange?: OnChangeFn<PaginationState>;
  manualFiltering?: boolean;
  filters?: ReactNode;
  filtersActive?: boolean;
  onReset?: () => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const table = useTable({
    features,
    data,
    columns,
    getRowId,
    state: { globalFilter: filter, ...state },
    onGlobalFilterChange: onGlobalFilterChange ?? setFilter,
    ...(onPaginationChange ? { onPaginationChange, autoResetPageIndex: false } : {}),
    manualFiltering,
    globalFilterFn: "includesString",
    manualPagination: !pagination,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  });
  const initialPending = pending && !data.length;
  if (error && !data.length && !pending)
    return (
      <div className="min-h-80">
        <ErrorNotice error={error} onRetry={onRetry} />
      </div>
    );
  return (
    <div className="min-h-80 space-y-3" aria-busy={pending}>
      {pending && (
        <span role="status" className="sr-only">
          {t("common_loading")}
        </span>
      )}
      <TableControls
        table={table}
        searchLabel={searchLabel}
        searchValue={state?.globalFilter ?? filter}
        filters={filters}
        filtersActive={filtersActive}
        pending={initialPending}
        onReset={onReset}
        resetPageOnSearch={!onGlobalFilterChange}
      />
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table className="min-w-max text-sm">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <TableHead
                    scope="col"
                    key={header.id}
                    className={
                      header.column.columnDef.meta?.align === "right"
                        ? "text-right whitespace-nowrap"
                        : "text-left whitespace-nowrap"
                    }
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {initialPending ? (
              ["first", "second"].map((id) => (
                <tr key={id} aria-hidden="true">
                  {table.getVisibleLeafColumns().map((column) => (
                    <TableCell key={column.id} className="h-16">
                      <Skeleton className="h-8 w-full" />
                    </TableCell>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} data-row-id={row.id} className="hover:bg-secondary/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      className={
                        cell.column.columnDef.meta?.align === "right"
                          ? "text-right tabular-nums"
                          : "text-left"
                      }
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <TableCell
                  colSpan={columns.length}
                  className="h-32 text-center text-base text-muted-foreground"
                >
                  {empty ?? t("common_no_results")}
                </TableCell>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
      {pagination && <TablePagination table={table} pending={pending} />}
    </div>
  );
}

function TableControls<T extends RowData>({
  table,
  searchLabel,
  searchValue,
  filters,
  filtersActive,
  pending,
  onReset,
  resetPageOnSearch,
}: {
  table: ReactTable<typeof features, T>;
  searchLabel?: string;
  searchValue: string;
  filters?: ReactNode;
  filtersActive: boolean;
  pending: boolean;
  onReset?: () => void;
  resetPageOnSearch: boolean;
}) {
  const { t } = useI18n();
  const sortable = table
    .getAllLeafColumns()
    .filter((column) => column.getCanSort() && typeof column.columnDef.header === "string");
  const sorting = table.state.sorting[0];
  const hasCriteria = !!searchValue || filtersActive || table.state.sorting.length > 0;
  function resetCriteria() {
    table.resetSorting();
    if (onReset) onReset();
    else {
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
          <NativeSelect
            aria-label={t("collection_sort")}
            disabled={pending}
            value={sorting ? `${sorting.id}:${sorting.desc ? "desc" : "asc"}` : ""}
            onChange={(event) => {
              const option = event.target.value;
              const column = sortable.find(
                (item) => option === `${item.id}:asc` || option === `${item.id}:desc`,
              );
              table.setSorting(
                column ? [{ id: column.id, desc: option === `${column.id}:desc` }] : [],
              );
              table.setPageIndex(0);
            }}
          >
            <option value="">{t("collection_sort_default")}</option>
            {sortable.flatMap((column) => [
              <option key={`${column.id}:asc`} value={`${column.id}:asc`}>
                {String(column.columnDef.header)} · {t("collection_sort_ascending")}
              </option>,
              <option key={`${column.id}:desc`} value={`${column.id}:desc`}>
                {String(column.columnDef.header)} · {t("collection_sort_descending")}
              </option>,
            ])}
          </NativeSelect>
        )
      }
      onReset={resetCriteria}
      resetDisabled={!hasCriteria}
    />
  );
}

function TablePagination<T extends RowData>({
  table,
  pending,
}: {
  table: ReactTable<typeof features, T>;
  pending: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {pending
          ? t("common_loading")
          : m.common_result_count({ count: table.getFilteredRowModel().rows.length }, { locale })}
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
