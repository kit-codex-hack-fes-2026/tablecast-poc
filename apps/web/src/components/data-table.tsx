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
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../i18n/locale";
import { m } from "../paraglide/messages";
import { ErrorNotice } from "./error-notice";
import { Skeleton } from "./ui/skeleton";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Table, TableCell, TableHead } from "./ui/table";

const features = tableFeatures({
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
      {searchLabel && (
        <label className="relative block max-w-sm">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-3 size-5 text-muted-foreground"
          />
          <span className="sr-only">{searchLabel}</span>
          <Input
            type="search"
            disabled={initialPending}
            className="pl-10"
            placeholder={searchLabel}
            value={state?.globalFilter ?? filter}
            onChange={(event) => {
              table.setGlobalFilter(event.target.value);
              if (!onGlobalFilterChange) table.setPageIndex(0);
            }}
          />
        </label>
      )}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table className="text-base">
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
                  <TableHead scope="col" key={header.id} className="whitespace-nowrap text-sm">
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
                    <TableCell key={column.id}>
                      <Skeleton className="h-11 w-full" />
                    </TableCell>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <tr key={row.id} data-row-id={row.id} className="hover:bg-secondary/50">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="text-base">
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

function TablePagination<T extends RowData>({
  table,
  pending,
}: {
  table: ReactTable<typeof features, T>;
  pending: boolean;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
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
