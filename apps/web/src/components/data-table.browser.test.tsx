import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-react";
import { DataTable } from "./data-table";
import { LocaleProvider } from "../i18n/locale";
import "../styles.css";

test("日本語の表は初回読込で列と領域を保ち、再取得で検索入力と既存行を残す", async () => {
  const columns = [{ accessorKey: "name", header: "店舗名" }];
  const view = (pending: boolean, data: { id: string; name: string }[], error?: Error) => (
    <LocaleProvider initialLocale="ja" persist={false}>
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
    page.getByRole("table").element().parentElement?.parentElement?.getBoundingClientRect().height,
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

test("表の検索・昇降順の並べ替え・ページ移動で対象行を保つ", async () => {
  const data = Array.from({ length: 25 }, (_, index) => ({
    id: String(index + 1),
    name: `店舗${String(index + 1).padStart(3, "0")}`,
  }));
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <DataTable
        columns={[
          {
            accessorKey: "name",
            sortFn: "text",
            header: "店舗名",
          },
        ]}
        data={data}
        getRowId={(row) => row.id}
        searchLabel="店舗を検索"
      />
    </LocaleProvider>,
  );
  await expect.element(page.getByRole("cell", { name: "店舗001", exact: true })).toBeVisible();
  await expect
    .element(page.getByRole("cell", { name: "店舗025", exact: true }))
    .not.toBeInTheDocument();
  const next = page.getByRole("button", { name: "次のページ", exact: true });
  const previous = page.getByRole("button", { name: "前のページ", exact: true });
  await next.click();
  await expect.element(page.getByRole("cell", { name: "店舗025", exact: true })).toBeVisible();
  await expect.element(next).toBeDisabled();
  await previous.click();
  await page.getByRole("combobox", { name: "並べ替え", exact: true }).selectOptions("name:desc");
  await expect.element(page.getByRole("cell").first()).toHaveTextContent("店舗025");
  await page.getByRole("searchbox").fill("店舗003");
  await expect.element(page.getByRole("cell").first()).toHaveTextContent("店舗003");
  await expect.element(next).toBeDisabled();
  await expect.element(previous).toBeDisabled();
  await page.getByRole("searchbox").fill("");
  await expect.element(page.getByRole("cell").first()).toHaveTextContent("店舗025");
  await expect.element(next).toBeEnabled();
  await page.getByRole("button", { name: "リセット", exact: true }).click();
  await expect.element(page.getByRole("cell").first()).toHaveTextContent("店舗001");
  await expect.element(page.getByRole("button", { name: "リセット", exact: true })).toBeDisabled();
});
