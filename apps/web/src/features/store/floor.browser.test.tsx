import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { z } from "zod";
import { cleanup, render } from "vitest-browser-react";
import { catalog, table } from "../../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../../i18n/locale";
import { Floor } from "./floor";
import { floorOptions, storesOptions, tableDetailOptions } from "./store-query";
import { catalogOptions } from "./menu-query";
import { floorSearchSchema } from "./floor-model";
import { TableDetail } from "./table-detail";
import { StoreShell } from "./store-shell";
import type * as StoreShellModule from "./store-shell";
import ja from "../../../messages/ja.json";
import "../../styles.css";

// 店舗選択は認証済みfixtureとし、Query・Router・通知hook・卓表示は実物を使う。
vi.mock("./store-shell", async (importOriginal) => ({
  ...(await importOriginal<typeof StoreShellModule>()),
  useStore: () => ({ id: "tablecast-komorebi" }),
}));

class TablecastSocket extends EventTarget {
  static current: TablecastSocket | undefined;
  constructor() {
    super();
    TablecastSocket.current = this;
  }
  close() {}
}

let client: QueryClient;
let initialViewport: { width: number; height: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  TablecastSocket.current = undefined;
  if (window.innerWidth !== initialViewport.width || window.innerHeight !== initialViewport.height)
    await page.viewport(initialViewport.width, initialViewport.height);
});

it("卓にフォーカス中に通知接続が変わってもフォーカスと詳細遷移を保つ", async () => {
  // 前提: 卓を表示し、通知接続だけを未接続にする。
  vi.stubGlobal("WebSocket", TablecastSocket);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (request.method === "GET" && new URL(request.url).pathname.endsWith("/events"))
      return Response.json({ cursor: table.cursor, events: [] });
    throw new Error(`未定義の要求: ${request.method} ${request.url}`);
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  client.setQueryData(floorOptions("tablecast-komorebi").queryKey, {
    store: { id: "tablecast-komorebi", name: "こもれび", role: "owner" },
    tables: [{ ...table, events: [] }],
    vacantTables: [],
    events: [],
    cursor: table.cursor,
  });
  const root = createRootRoute();
  const floor = createRoute({ getParentRoute: () => root, path: "/", component: Floor });
  const visit = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/visits/$sessionId",
    component: () => <h1>卓の詳細</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([floor, visit]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  const button = screen.getByRole("button", { name: /^T03/ });
  await expect.element(button).toBeEnabled();
  button.element().focus();
  await expect.element(button).toHaveFocus();

  // 操作: 選択中の卓を変えずに通知接続を更新する。
  await expect.poll(() => TablecastSocket.current).toBeDefined();
  TablecastSocket.current?.dispatchEvent(new Event("open"));
  await expect.element(screen.getByText("更新を受信中", { exact: true })).toBeVisible();

  // 結果: DOM置換でフォーカスを失わず、同じ卓の詳細へ移動できる。
  await expect.element(button).toHaveFocus();
  await button.click();
  await expect.element(screen.getByRole("heading", { name: "卓の詳細" })).toBeVisible();
  expect(router.state.location.pathname).toBe(
    `/admin/stores/tablecast-komorebi/visits/${table.id}`,
  );
});

it("指標から要対応の卓を絞り、来店詳細の表示を切り替えても同じフロア条件へ戻る", async () => {
  await page.viewport(1440, 900);
  vi.stubGlobal("WebSocket", TablecastSocket);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (new URL(request.url).pathname === "/api/auth/organization/get-full-organization")
      return Response.json(null);
    if (new URL(request.url).pathname.endsWith("/events"))
      return Response.json({ cursor: table.cursor, events: [] });
    throw new Error(`未定義の要求: ${request.method} ${request.url}`);
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  const openedAt = Date.now() - 25 * 60_000;
  const billRequested = {
    ...table,
    openedAt,
    id: "tablecast-billing",
    tableName: "T04",
    staffCalled: false,
    voiceState: "stopped" as const,
    billRequested: true,
    bill: { ...table.bill, due: 500 },
    events: [],
  };
  client.setQueryData(floorOptions("tablecast-komorebi").queryKey, {
    store: { id: "tablecast-komorebi", name: "こもれび", role: "owner" },
    tables: [
      { ...table, openedAt, events: [] },
      billRequested,
      {
        ...table,
        id: "tablecast-normal",
        openedAt,
        tableName: "T05",
        staffCalled: false,
        voiceState: "stopped",
        billRequested: false,
        events: [],
      },
    ],
    vacantTables: [{ id: "tablecast-vacant", name: "T06" }],
    events: [],
    cursor: table.cursor,
  });
  client.setQueryData(
    tableDetailOptions("tablecast-komorebi", billRequested.id).queryKey,
    billRequested,
  );
  client.setQueryData(catalogOptions("tablecast-komorebi", table.configVersion).queryKey, catalog);
  client.setQueryData(["tablecast-session"], null);
  client.setQueryData(storesOptions.queryKey, {
    locale: "ja",
    stores: [
      {
        id: "tablecast-komorebi",
        name: "こもれび",
        logo: null,
        role: "owner",
        organizationId: "tablecast-komorebi-org",
      },
    ],
  });
  const root = createRootRoute();
  const store = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
    component: () => <StoreShell storeId="tablecast-komorebi" />,
  });
  const floor = createRoute({
    getParentRoute: () => store,
    path: "floor",
    validateSearch: floorSearchSchema,
    component: function FloorPage() {
      return (
        <Floor
          {...floor.useSearch()}
          onNavigate={(search) =>
            void router.navigate({
              to: "/admin/stores/$storeId/floor",
              params: { storeId: "tablecast-komorebi" },
              search,
            })
          }
        />
      );
    },
  });
  const visit = createRoute({
    getParentRoute: () => store,
    path: "visits/$sessionId",
    validateSearch: z.object({
      floorView: floorSearchSchema.shape.view,
      floorDate: floorSearchSchema.shape.date,
      floorFilter: floorSearchSchema.shape.filter,
      floorQ: floorSearchSchema.shape.q,
      floorSort: floorSearchSchema.shape.sort,
      floorZoom: floorSearchSchema.shape.zoom,
      view: z.enum(["overview", "logs", "orders", "billing", "diagnostics"]).default("overview"),
    }),
    component: function VisitPage() {
      const search = visit.useSearch();
      return (
        <TableDetail
          storeId="tablecast-komorebi"
          tableId={billRequested.id}
          view={search.view}
          floorSearch={{
            view: search.floorView,
            date: search.floorDate,
            filter: search.floorFilter,
            q: search.floorQ,
            sort: search.floorSort,
            zoom: search.floorZoom,
          }}
          onViewChange={(view) =>
            void router.navigate({ to: ".", search: (previous) => ({ ...previous, view }) })
          }
        />
      );
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([store.addChildren([floor, visit])]),
    history: createMemoryHistory({
      initialEntries: [
        "/admin/stores/tablecast-komorebi/floor?view=list&date=2026-09-06&filter=attention&sort=table%3Adesc&q=T0&zoom=compact",
      ],
    }),
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  await expect.element(screen.getByRole("button", { name: /^T03/ })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /^T04/ })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /^T05/ })).not.toBeInTheDocument();
  await page.viewport(390, 844);
  await screen.getByRole("button", { name: ja.admin_navigation, exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect
    .element(dialog.getByRole("combobox", { name: ja.stores_title, exact: true }))
    .toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
    document.documentElement.clientWidth,
  );
  await page.getByRole("button", { name: ja.common_close, exact: true }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  await page.viewport(1440, 900);
  await screen.getByRole("button", { name: new RegExp(`^${ja.admin_billing}`) }).click();
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({ filter: "billing", date: "2026-09-06", view: "list" });
  await expect.element(screen.getByRole("button", { name: /^T03/ })).not.toBeInTheDocument();
  await screen.getByRole("button", { name: /^T04/ }).click();
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({
      floorFilter: "billing",
      floorDate: "2026-09-06",
      floorView: "list",
      floorQ: "T0",
      floorSort: "table:desc",
      floorZoom: "compact",
    });
  await screen.getByRole("tab", { name: ja.admin_logs, exact: true }).click();
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({ view: "logs", floorFilter: "billing" });
  await screen.getByRole("main").getByRole("link", { name: ja.admin_live, exact: true }).click();
  await expect
    .element(screen.getByRole("heading", { name: ja.floor_filter_billing, exact: true }))
    .toBeVisible();
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({ filter: "billing", date: "2026-09-06", view: "list" });
  await expect.element(screen.getByRole("button", { name: /^T04/ })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: /^T05/ })).not.toBeInTheDocument();
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({ q: "T0", sort: "table:desc", zoom: "compact" });
  await screen.getByRole("searchbox", { name: ja.floor_search, exact: true }).fill("T04");
  await screen.getByRole("button", { name: ja.collection_reset, exact: true }).click();
  await expect
    .element(screen.getByRole("searchbox", { name: ja.floor_search, exact: true }))
    .toHaveValue("");
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({ filter: "all", date: "2026-09-06", view: "list" });
  await expect.element(screen.getByRole("button", { name: /^T05/ })).toBeVisible();
  expect(router.state.location.search.q).toBeUndefined();
  expect(router.state.location.search.sort).toBeUndefined();
  expect(router.state.location.search.zoom).toBe("compact");
  await screen.getByRole("combobox", { name: ja.collection_sort, exact: true }).click();
  await page
    .getByRole("option", {
      name: `${ja.floor_table} · ${ja.collection_sort_descending}`,
      exact: true,
    })
    .click();
  await expect.poll(() => router.state.location.search.sort).toBe("table:desc");
  const names = () =>
    Array.from(
      screen
        .getByRole("region", { name: ja.floor_list, exact: true })
        .element()
        .querySelectorAll("h3"),
      (item) => item.textContent,
    );
  await expect.poll(names).toEqual(["T06", "T05", "T04", "T03"]);
});
