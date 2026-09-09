import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../i18n/locale";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Table, TableCell, TableHead } from "./ui/table";

export function DataTable<T>({
  data,
  columns,
  getRowId,
  searchLabel,
  empty,
  pagination = true,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  getRowId: (row: T) => string;
  searchLabel?: string;
  empty?: string;
  pagination?: boolean;
}) {
  const { locale } = useI18n();
  const [filter, setFilter] = useState("");
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: { globalFilter: filter },
    onGlobalFilterChange: setFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: pagination ? getPaginationRowModel() : undefined,
    initialState: { pagination: { pageSize: 20 } },
  });
  return (
    <div className="space-y-3">
      {searchLabel && (
        <label className="relative block max-w-sm">
          <Search
            aria-hidden="true"
            className="absolute left-3 top-3 size-5 text-muted-foreground"
          />
          <span className="sr-only">{searchLabel}</span>
          <Input
            type="search"
            className="pl-10"
            placeholder={searchLabel}
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              table.setPageIndex(0);
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
            {table.getRowModel().rows.length ? (
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
                  {empty ?? (locale === "ja" ? "該当するデータがありません" : "No results")}
                </TableCell>
              </tr>
            )}
          </tbody>
        </Table>
      </div>
      {pagination && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {table.getFilteredRowModel().rows.length} {locale === "ja" ? "件" : "records"}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="outline"
              aria-label={locale === "ja" ? "前のページ" : "Previous page"}
              disabled={!table.getCanPreviousPage()}
              onClick={() => table.previousPage()}
            >
              <ChevronLeft />
            </Button>
            <span className="min-w-16 text-center tabular-nums">
              {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
            </span>
            <Button
              size="icon"
              variant="outline"
              aria-label={locale === "ja" ? "次のページ" : "Next page"}
              disabled={!table.getCanNextPage()}
              onClick={() => table.nextPage()}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
