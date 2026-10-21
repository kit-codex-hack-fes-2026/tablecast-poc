import { createElement } from "react";
import { renderToString } from "react-dom/server";
import type { OnChangeFn, PaginationState } from "@tanstack/react-table";
import { expect, it, vi } from "vitest";
import { LocaleContext } from "../i18n/locale-context";
import { DataTable } from "./data-table";

it.each(["", "対象"])("SSRは範囲外ページを検索後の件数で補正して行を返す: %s", (filter) => {
  const onPaginationChange = vi.fn<OnChangeFn<PaginationState>>();
  const data = Array.from({ length: filter ? 45 : 5 }, (_, index) => ({
    id: String(index),
    name: index < 5 ? `対象店舗${index + 1}` : `その他店舗${index + 1}`,
  }));
  const html = renderToString(
    createElement(
      LocaleContext.Provider,
      { value: { locale: "ja", setLocale: () => {} } },
      createElement(DataTable<(typeof data)[number]>, {
        data,
        columns: [{ accessorKey: "name", header: "店舗名" }],
        getRowId: (row) => row.id,
        state: { globalFilter: filter, pagination: { pageIndex: 1, pageSize: 20 } },
        onPaginationChange,
      }),
    ),
  );
  expect(html).toContain('data-row-id="0"');
  expect(html).toContain('data-row-id="4"');
  expect(html.replace(/<!--.*?-->/g, "")).toContain(">1 / 1<");
  expect(onPaginationChange).not.toHaveBeenCalled();
});
