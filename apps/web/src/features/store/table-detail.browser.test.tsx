import type { Catalog, OptionCondition, TableState } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { catalog, table } from "../../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../../i18n/locale";
import { catalogOptions } from "./menu-query";
import { tableDetailOptions } from "./store-query";
import { TableDetail } from "./table-detail";
import "../../styles.css";

let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

it.each(["ja", "en"] as const)(
  "店側の%sカートで卓と同じ版のカタログから未充足条件の名前を表示する",
  async (locale) => {
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
      component: () => (
        <main className="p-6">
          <TableDetail
            storeId={state.storeId}
            tableId={state.id}
            view="orders"
            onViewChange={() => undefined}
          />
        </main>
      ),
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
    await page.screenshot({
      path: `../../../test-results/browser/tablecast-staff-conditions-${locale}.png`,
    });
    await expect
      .element(
        page.getByText(locale === "ja" ? "トッピング / チョコレート" : "Toppings / Chocolate", {
          exact: true,
        }),
      )
      .toBeVisible();
    await expect.element(page.getByText(target.id, { exact: true })).not.toBeInTheDocument();
    expect(requests).toEqual([`/api/admin/stores/${state.storeId}/catalog`]);
  },
);
