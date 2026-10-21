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
  type SortingState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ArrowDownUp, List, type LucideIcon } from "lucide-react";
import { useEffect, useEffectEvent, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "../i18n/locale";
import { m } from "../paraglide/messages";
import { ErrorNotice } from "./error-notice";
import { Skeleton } from "./ui/skeleton";

import { Button } from "./ui/button";
import { CollectionSort } from "./collection-sort";
import { CollectionToolbar } from "./collection-toolbar";
import { Table, TableCell, TableHead } from "./ui/table";

const columnMeta: {
  align?: "left" | "right";
  icon?: LucideIcon;
  sortLabel?: string;
  rowHeader?: boolean;
} = {};
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
 * stateとonGlobalFilterChange/onPaginationChange/onSortingChangeでURL等へ同期できる。
 * searchPlaceholderは検索対象、tableLabelは横スクロール領域の名前を指定する。
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
  searchPlaceholder,
  tableLabel,
  empty,
  pagination = true,
  pending = false,
  error,
  onRetry,
  state,
  onGlobalFilterChange,
  onPaginationChange,
  onPaginationClamp,
  onSortingChange,
  manualFiltering,
  filters,
  filtersActive = false,
  onReset,
}: {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  searchLabel?: string;
  searchPlaceholder?: string;
  tableLabel?: string;
  empty?: string;
  pagination?: boolean;
  pending?: boolean;
  error?: unknown;
  onRetry?: () => void;
  state?: { globalFilter?: string; pagination?: PaginationState; sorting?: SortingState };
  onGlobalFilterChange?: OnChangeFn<string>;
  onPaginationChange?: OnChangeFn<PaginationState>;
  onPaginationClamp?: (pagination: PaginationState) => void;
  onSortingChange?: OnChangeFn<SortingState>;
  manualFiltering?: boolean;
  filters?: ReactNode;
  filtersActive?: boolean;
  onReset?: () => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const bounded = useBoundedPagination({
    enabled: pagination,
    ready: !pending && !error,
    requested: state?.pagination,
    onChange: onPaginationChange,
    onClamp: onPaginationClamp,
  });
  const table = useTable({
    features,
    data,
    columns,
    getRowId,
    state: {
      globalFilter: filter,
      ...state,
      ...bounded.state,
    },
    onGlobalFilterChange: onGlobalFilterChange ?? setFilter,
    ...bounded.options,
    ...(onSortingChange ? { onSortingChange } : {}),
    manualFiltering,
    globalFilterFn: "includesString",
    manualPagination: !pagination,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  });
  bounded.syncPageCount(table.getPageCount());
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
        searchPlaceholder={searchPlaceholder}
        searchValue={state?.globalFilter ?? filter}
        filters={filters}
        filtersActive={filtersActive}
        pending={initialPending}
        onReset={onReset}
        resetPageOnSearch={!onGlobalFilterChange}
        resetPageOnSort={!onSortingChange}
      />
      {/* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- 横スクロール領域をSafariでもキーボード操作できるようにする。 */}
      <div
        tabIndex={tableLabel ? 0 : undefined}
        role={tableLabel ? "region" : undefined}
        aria-label={tableLabel}
        className="min-h-48 overflow-x-auto rounded-xl border border-border bg-card focus-visible:outline-2 focus-visible:outline-ring"
      >
        <TableMarkup
          table={table}
          pending={initialPending}
          empty={empty ?? t("common_no_results")}
        />
      </div>
      {/* oxlint-enable jsx-a11y/no-noninteractive-tabindex */}
      {pagination && <TablePagination table={table} pending={pending} />}
    </div>
  );
}

function useBoundedPagination({
  enabled,
  ready,
  requested,
  onChange,
  onClamp,
}: {
  enabled: boolean;
  ready: boolean;
  requested?: PaginationState;
  onChange?: OnChangeFn<PaginationState>;
  onClamp?: (pagination: PaginationState) => void;
}) {
  const [lastPageIndex, setLastPageIndex] = useState<number | null>(null);
  const effective = useMemo(
    () =>
      enabled && requested && lastPageIndex !== null
        ? { ...requested, pageIndex: Math.min(requested.pageIndex, lastPageIndex) }
        : requested,
    [enabled, requested, lastPageIndex],
  );
  const normalizeUrl = useEffectEvent((value: PaginationState) => (onClamp ?? onChange)?.(value));
  // URLという外部状態の正規化だけをcommit後に行う。取得中・失敗時は元のURLを維持する。
  useEffect(() => {
    if (enabled && ready && requested && effective && requested.pageIndex !== effective.pageIndex)
      // oxlint-disable-next-line react-doctor/no-pass-data-to-parent, react-doctor/no-pass-live-state-to-parent -- 表示用stateの転送ではなく、描画中に変更できないRouterのURLを正規化する。
      normalizeUrl(effective);
  }, [enabled, ready, requested, effective]);
  return {
    state: effective ? { pagination: effective } : {},
    options: onChange
      ? {
          onPaginationChange: (next: Parameters<OnChangeFn<PaginationState>>[0]) =>
            onChange(typeof next === "function" && effective ? next(effective) : next),
          autoResetPageIndex: false,
        }
      : {},
    syncPageCount: (count: number) => {
      const next = Math.max(0, count - 1);
      // Reactの条件付きlocal state調整で再描画し、SSRも空ページを確定しない。
      if (enabled && ready && requested && lastPageIndex !== next) setLastPageIndex(next);
    },
  };
}

function TableMarkup<T extends RowData>({
  table,
  pending,
  empty,
}: {
  table: ReactTable<typeof features, T>;
  pending: boolean;
  empty: string;
}) {
  return (
    <Table className="min-w-max text-sm">
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <TableHead
                scope="col"
                aria-sort={
                  header.column.getIsSorted() === "asc"
                    ? "ascending"
                    : header.column.getIsSorted() === "desc"
                      ? "descending"
                      : undefined
                }
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
        {pending ? (
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
                  scope={cell.column.columnDef.meta?.rowHeader ? "row" : undefined}
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
              colSpan={table.getVisibleLeafColumns().length}
              className="h-32 text-center text-base text-muted-foreground"
            >
              {empty}
            </TableCell>
          </tr>
        )}
      </tbody>
    </Table>
  );
}

function TableControls<T extends RowData>({
  table,
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
  table: ReactTable<typeof features, T>;
  searchLabel?: string;
  searchPlaceholder?: string;
  searchValue: string;
  filters?: ReactNode;
  filtersActive: boolean;
  pending: boolean;
  onReset?: () => void;
  resetPageOnSearch: boolean;
  resetPageOnSort: boolean;
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
  const hasCriteria = !!searchValue || filtersActive || table.state.sorting.length > 0;
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
              { value: "", label: t("collection_sort_default"), icon: List },
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
