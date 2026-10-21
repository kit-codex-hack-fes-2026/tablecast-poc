import { flexRender, type ReactTable, type RowData } from "@tanstack/react-table";
import type { features } from "./data-table-model";
import { Skeleton } from "./ui/skeleton";
import { Table, TableCell, TableHead } from "./ui/table";

export function TableMarkup<T extends RowData>({
  table,
  pending,
  empty,
}: {
  empty: string;
  pending: boolean;
  table: ReactTable<typeof features, T>;
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
