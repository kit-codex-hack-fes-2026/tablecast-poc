import {
  type ColumnSort,
  flexRender,
  type OnChangeFn,
  type PaginationState,
  type RowData,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import { type ReactNode, useEffect, useEffectEvent, useMemo, useState } from "react";
import { useI18n } from "../i18n/locale";
import { TableControls, TablePagination } from "./data-table-controls";
import { type DataTableColumn, features } from "./data-table-model";
import { ErrorNotice } from "./error-notice";
import { Skeleton } from "./ui/skeleton";
import { Table, TableCell, TableHead } from "./ui/table";
export function DataTable<T extends RowData>({
  data,
  columns,
  defaultSort,
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
  columns: DataTableColumn<T>[];
  data: T[];
  defaultSort: ColumnSort | { label: string };
  empty?: string;
  error?: unknown;
  filters?: ReactNode;
  filtersActive?: boolean;
  getRowId: (row: T) => string;
  manualFiltering?: boolean;
  onGlobalFilterChange?: OnChangeFn<string>;
  onPaginationChange?: OnChangeFn<PaginationState>;
  onPaginationClamp?: (pagination: PaginationState) => void;
  onReset?: () => void;
  onRetry?: () => void;
  onSortingChange?: OnChangeFn<SortingState>;
  pagination?: boolean;
  pending?: boolean;
  searchLabel?: string;
  searchPlaceholder?: string;
  state?: { globalFilter?: string; pagination?: PaginationState; sorting?: SortingState };
  tableLabel?: string;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const requestedSorting = state?.sorting ?? sorting;
  const effectiveSorting = useMemo(
    () => (requestedSorting.length ? requestedSorting : "id" in defaultSort ? [defaultSort] : []),
    [requestedSorting, defaultSort],
  );
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
      sorting: effectiveSorting,
      ...bounded.state,
    },
    onGlobalFilterChange: onGlobalFilterChange ?? setFilter,
    ...bounded.options,
    onSortingChange: onSortingChange ?? setSorting,
    manualFiltering,
    globalFilterFn: "includesString",
    manualPagination: !pagination,
    initialState: { pagination: { pageIndex: 0, pageSize: 20 } },
  });
  bounded.syncPageCount(table.getPageCount());
  const initialPending = pending && !data.length;
  function renderTable() {
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
                {empty ?? t("common_no_results")}
              </TableCell>
            </tr>
          )}
        </tbody>
      </Table>
    );
  }
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
        sourceOrderLabel={"label" in defaultSort ? defaultSort.label : undefined}
        sortingActive={requestedSorting.length > 0}
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
        {renderTable()}
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
  onChange?: OnChangeFn<PaginationState>;
  onClamp?: (pagination: PaginationState) => void;
  ready: boolean;
  requested?: PaginationState;
}) {
  const [lastPageIndex, setLastPageIndex] = useState<null | number>(null);
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
