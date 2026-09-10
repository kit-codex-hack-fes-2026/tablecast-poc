import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { table } from "../../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../../i18n/locale";
import { Floor } from "./floor";
import { floorOptions } from "./store-query";

// 店舗選択は認証済みfixtureとし、Query・Router・通知hook・卓表示は実物を使う。
vi.mock("./store-shell", () => ({
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
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  TablecastSocket.current = undefined;
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
      <LocaleProvider initialLocale="ja">
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
