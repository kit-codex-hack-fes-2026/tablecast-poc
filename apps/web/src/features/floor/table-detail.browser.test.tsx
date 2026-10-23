import type { Catalog, OptionCondition, TableState } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { catalog, table } from "../../../.storybook/tablecast-fixtures";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { catalogOptions } from "../catalog/catalog-query";
import { tableDetailOptions } from "./floor-query";
import { TableDetail } from "./table-detail";

let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

it("店側の日本語カートで卓と同じ版のカタログから未充足条件の名前を表示する", async () => {
  const locale = "ja";
  const labels = ja;
  const current: Catalog = structuredClone(catalog);
  current.version = 2;
  const product = current.configuration.products[0];
  const group = product?.modifiers[0];
  const owner = group?.options[0];
  const target = group?.options[1];
  if (!product || !group || !owner || !target) throw new Error("条件fixtureがありません");
  owner.id = "a7f284ce-61f5-4d64-a77d-55740574cb38";
  target.id = "417aa3eb-d940-46c9-b284-4e3d477f4cf2";
  owner.text.ja.displayName = "ホイップ";
  owner.text.en.displayName = "Whipped cream";
  target.text.ja.displayName = "チョコレート";
  target.text.en.displayName = "Chocolate";
  group.text.ja.displayName = "トッピング";
  group.text.en.displayName = "Toppings";
  group.kind = "multiple";
  group.max = 2;
  const expression: OptionCondition = { kind: "option", optionId: target.id };
  owner.conditions = { version: 2, requires: expression, excludes: null };
  const state: TableState = structuredClone(table);
  state.status = "closed";
  state.configVersion = current.version;
  const orderedLine = structuredClone(state.cart.lines[0]);
  if (!orderedLine) throw new Error("注文済みの商品fixtureがありません");
  orderedLine.name = { ja: "当時の注文名", en: "Original ordered name" };
  state.orders = [
    {
      id: "tablecast-historical-order",
      tableSessionId: state.id,
      snapshotId: "tablecast-historical-snapshot",
      idempotencyKey: "tablecast-historical-order",
      status: "submitted",
      total: orderedLine.total,
      createdAt: state.openedAt,
      snapshot: {
        id: "tablecast-historical-snapshot",
        tableSessionId: state.id,
        cartVersion: 1,
        configVersion: 1,
        lines: [orderedLine],
        total: orderedLine.total,
        locale: "ja",
        text: "当時の注文原文",
        expiresAt: state.openedAt,
        channel: "gui",
        status: "submitted",
        createdTurnId: null,
        plan: null,
      },
    },
  ];
  state.cart.complete = false;
  const line = state.cart.lines[0];
  if (!line) throw new Error("カートfixtureがありません");
  line.selections = [{ optionId: owner.id, quantity: 1 }];
  line.options = [
    {
      id: owner.id,
      quantity: 1,
      priceDelta: 0,
      name: { ja: "ホイップ", en: "Whipped cream" },
      speechName: { ja: "ホイップ", en: "Whipped cream" },
    },
  ];
  line.conditionIssues = [{ optionId: owner.id, relation: "requires" }];
  const requests: string[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(new Request(input, init).url).pathname;
    // 会計の会員情報取得は、検証対象のカタログ取得と分ける。
    if (path === `/api/admin/stores/${state.storeId}/tables/${state.id}/coupons`)
      return Promise.resolve(
        Response.json({ expectedVersion: state.cart.version, requested: [], uses: [] }),
      );
    if (path === `/api/admin/stores/${state.storeId}/tables/${state.id}/points`)
      return Promise.resolve(
        Response.json({
          sessionId: state.id,
          expectedVersion: state.cart.version,
          rules: { enabled: false, kind: "visit", points: 0, unitYen: 100 },
          confirmedAt: null,
          participants: [],
          allocations: [],
          idempotencyKey: null,
        }),
      );
    requests.push(path);
    if (path === `/api/admin/stores/${state.storeId}/catalog`)
      return Promise.resolve(Response.json(current));
    throw new Error(`未定義の要求: ${path}`);
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(tableDetailOptions(state.storeId, state.id).queryKey, {
    ...state,
    events: [],
  });
  // 設定画面に残る旧版cacheを卓の現在版と混同しない。
  client.setQueryData(catalogOptions(state.storeId).queryKey, catalog);
  const root = createRootRoute({
    component: function Visit() {
      const [view, setView] = useState<"billing" | "diagnostics" | "logs" | "orders" | "overview">(
        "overview",
      );
      return (
        <main className="p-6">
          <TableDetail
            storeId={state.storeId}
            tableId={state.id}
            view={view}
            onViewChange={setView}
          />
        </main>
      );
    },
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await page.viewport(768, 1024);
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  await expect
    .element(page.getByRole("heading", { name: state.tableName, exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: labels.admin_close_session, exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: labels.admin_acknowledge, exact: true }))
    .not.toBeInTheDocument();
  expect(requests).toEqual([]);
  await page.getByRole("tab", { name: "会計", exact: true }).click();
  expect(requests).toEqual([]);
  expect(document.querySelectorAll("form").length).toBe(0);
  await page.getByRole("tab", { name: "カート・注文", exact: true }).click();

  await expect
    .element(
      page.getByText("トッピング / チョコレート", {
        exact: true,
      }),
    )
    .toBeVisible();
  await expect.element(page.getByText(target.id, { exact: true })).not.toBeInTheDocument();
  await expect.element(page.getByText(orderedLine.name[locale], { exact: true })).toBeVisible();
  expect(document.querySelector("[data-ui='order-card']")?.querySelectorAll("button").length).toBe(
    0,
  );
  expect(requests).toEqual([`/api/admin/stores/${state.storeId}/catalog`]);
});
