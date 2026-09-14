import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { DataTable } from "./data-table";
import { LocaleProvider } from "../i18n/locale";
import "../styles.css";

for (const locale of ["ja", "en"] as const) {
  test(`${locale}: 表の初回読込で列と領域を保ち、再取得で検索入力と既存行を残す`, async () => {
    const columns = [{ accessorKey: "name", header: "店舗名" }];
    const view = (pending: boolean, data: { id: string; name: string }[], error?: Error) => (
      <LocaleProvider initialLocale={locale}>
        <DataTable
          columns={columns}
          data={data}
          pending={pending}
          error={error}
          getRowId={(row) => row.id}
          searchLabel="店舗を検索"
        />
      </LocaleProvider>
    );
    const screen = await render(view(true, []));
    await expect.element(page.getByRole("columnheader", { name: "店舗名" })).toBeVisible();
    const pendingHeight = page
      .getByRole("table")
      .element()
      .parentElement?.parentElement?.getBoundingClientRect().height;
    await screen.rerender(view(false, []));
    expect(
      page.getByRole("table").element().parentElement?.parentElement?.getBoundingClientRect()
        .height,
    ).toBe(pendingHeight);
    await screen.rerender(view(false, [{ id: "tablecast", name: "卓上喫茶" }]));
    await page.getByRole("searchbox").fill("卓上");
    await screen.rerender(view(true, [{ id: "tablecast", name: "卓上喫茶" }]));
    await expect.element(page.getByRole("cell", { name: "卓上喫茶" })).toBeVisible();
    await expect.element(page.getByRole("searchbox")).toHaveValue("卓上");
    await screen.rerender(
      view(false, [{ id: "tablecast", name: "卓上喫茶" }], new Error("再取得失敗")),
    );
    await expect.element(page.getByRole("cell", { name: "卓上喫茶" })).toBeVisible();
    await expect.element(page.getByRole("searchbox")).toHaveValue("卓上");
  });
}
