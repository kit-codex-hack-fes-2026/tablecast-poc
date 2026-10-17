import type { TimelinePage } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { table } from "../../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../../i18n/locale";
import { FloorTimeline } from "./floor-timeline";
import { timelineOptions } from "./timeline-query";
import { floorOptions } from "./store-query";
import { floorSearchSchema, moveDate, storeDate } from "./floor-model";
import { Floor, FloorPending } from "./floor";
import ja from "../../../messages/ja.json";
import "../../styles.css";

const startAt = Date.parse("2026-09-15T00:00:00+09:00");
const hour = 3_600_000;
const initial: TimelinePage = {
  date: "2026-09-15",
  timeZone: "Asia/Tokyo",
  startAt,
  endAt: startAt + 24 * hour,
  observedAt: startAt + 12 * hour,
  sessions: [
    {
      id: table.id,
      tableId: "tablecast-t03",
      guestCount: 4,
      status: "open",
      openedAt: startAt + 9 * hour,
      closedAt: null,
    },
  ],
  nextCursor: { openedAt: startAt + 9 * hour, id: table.id },
};
let client: QueryClient;
vi.mock("./store-shell", () => ({ useStore: () => ({ id: "tablecast-komorebi" }) }));
let initialViewport: { width: number; height: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  try {
    await cleanup();
    client.clear();
    vi.unstubAllGlobals();
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

it("日本語で初回HTTP待機中も本番のフロア見出しと表を表示し、取得後も見出しの位置を保つ", async () => {
  const locale = "ja";
  const labels = ja;
  await page.viewport(1024, 768);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const release = Promise.withResolvers<Response>();
  const reached = Promise.withResolvers<void>();
  vi.stubGlobal(
    "WebSocket",
    class extends EventTarget {
      close() {}
    },
  );
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/admin/stores/tablecast-komorebi") {
      reached.resolve();
      return release.promise;
    }
    if (path.endsWith("/events")) return Response.json({ cursor: table.cursor, events: [] });
    throw new Error(`未定義の要求: ${request.method} ${path}`);
  });
  const root = createRootRoute({
    component: () => (
      <main className="space-y-6 p-6">
        <Outlet />
      </main>
    ),
  });
  const start = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => (
      <Link to="/admin/stores/$storeId/floor" params={{ storeId: "tablecast-komorebi" }}>
        フロアへ進む
      </Link>
    ),
  });
  const floor = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/floor",
    loader: () => client.ensureQueryData(floorOptions("tablecast-komorebi")),
    pendingComponent: FloorPending,
    component: Floor,
    pendingMs: 0,
    pendingMinMs: 0,
  });
  const router = createRouter({
    routeTree: root.addChildren([start, floor]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  try {
    const screen = await render(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale={locale} persist={false}>
          <RouterProvider router={router} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await screen.getByRole("link", { name: "フロアへ進む" }).click();
    await reached.promise;
    const heading = screen.getByRole("heading", { name: labels.admin_live, exact: true });
    await expect.element(heading).toBeVisible();
    await expect.element(screen.getByRole("table")).toBeVisible();
    await expect.element(screen.getByRole("status").first()).toBeVisible();
    const before = heading.element().getBoundingClientRect();
    // 英語の長い行は内側へ横スクロールするため、利用者に見える枠の幅を観測する。
    const tableWidth = screen
      .getByRole("table")
      .element()
      .parentElement?.getBoundingClientRect().width;
    release.resolve(
      Response.json({
        store: { id: "tablecast-komorebi", name: "こもれび", role: "owner" },
        tables: [{ ...table, events: [] }],
        vacantTables: [],
        events: [],
        cursor: table.cursor,
      }),
    );
    await expect.element(screen.getByRole("button", { name: /^T03/ })).toBeEnabled();
    const after = heading.element().getBoundingClientRect();
    expect({ x: after.x, y: after.y, width: after.width, height: after.height }).toEqual({
      x: before.x,
      y: before.y,
      width: before.width,
      height: before.height,
    });
    expect(screen.getByRole("table").element().parentElement?.getBoundingClientRect().width).toBe(
      tableWidth,
    );
    await expect.poll(() => document.querySelectorAll('[aria-busy="true"]').length).toBe(0);
  } finally {
    release.resolve(Response.json({ tables: [], vacantTables: [], events: [], cursor: 0 }));
  }
});

it("日本語で同卓の閉卓・利用中を選び、戻ると時間軸と横位置を復元して空卓へ進む", async () => {
  const locale = "ja";
  const labels = ja;
  const closedId = "tablecast-closed-visit";
  const data: TimelinePage = {
    ...initial,
    nextCursor: null,
    sessions: [
      {
        ...initial.sessions[0],
        id: closedId,
        guestCount: 1,
        status: "closed",
        closedAt: startAt + 10 * hour,
      },
      initial.sessions[0],
    ],
  };
  vi.stubGlobal(
    "WebSocket",
    class extends EventTarget {
      close() {}
    },
  );
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(new Request(input, init).url);
    if (url.pathname.endsWith("/events"))
      return Response.json({ cursor: table.cursor, events: [] });
    if (url.pathname.endsWith("/timeline"))
      return Response.json({ ...data, date: url.searchParams.get("date") ?? data.date });
    throw new Error(`未定義の要求: ${url.pathname}`);
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(floorOptions("tablecast-komorebi").queryKey, {
    store: { id: "tablecast-komorebi", name: "こもれび", role: "owner" },
    tables: [{ ...table, tableId: "tablecast-t03", events: [] }],
    vacantTables: [{ id: "tablecast-t10", name: "T10" }],
    events: [],
    cursor: table.cursor,
  });
  client.setQueryData(timelineOptions("tablecast-komorebi", data.date).queryKey, {
    pages: [data],
    pageParams: [null],
  });
  const root = createRootRoute();
  const floor = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/floor",
    validateSearch: floorSearchSchema,
    component: function Timeline() {
      return (
        <Floor
          {...floor.useSearch()}
          initialNow={data.observedAt}
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
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/visits/$sessionId",
    component: () => <h1>{visit.useParams().sessionId}</h1>,
  });
  const open = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/tables/$tableId/open",
    component: () => <h1>空卓を開く</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([floor, visit, open]),
    history: createMemoryHistory({
      initialEntries: [`/admin/stores/tablecast-komorebi/floor?view=timeline&date=${data.date}`],
    }),
    scrollRestoration: true,
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  const viewport = screen.getByRole("region", { name: labels.floor_timeline, exact: true });
  await expect.element(viewport).toBeVisible();
  viewport.element().scrollLeft = 650;
  await screen.getByText(labels.floor_visits, { exact: true }).click();
  await screen
    .getByRole("region", { name: "T03", exact: true })
    .getByRole("button", { name: /^T03 · 1 / })
    .click();
  await expect.element(screen.getByRole("heading", { name: closedId, exact: true })).toBeVisible();
  router.history.back();
  await expect.element(viewport).toBeVisible();
  await expect.poll(() => viewport.element().scrollLeft).toBe(650);
  await screen.getByText(labels.floor_visits, { exact: true }).click();
  await screen
    .getByRole("region", { name: "T03", exact: true })
    .getByRole("button", { name: /^T03 · 4 / })
    .click();
  await expect.element(screen.getByRole("heading", { name: table.id, exact: true })).toBeVisible();
  router.history.back();
  await screen.getByRole("tab", { name: labels.floor_list, exact: true }).click();
  await expect
    .element(screen.getByRole("columnheader", { name: labels.admin_elapsed, exact: true }))
    .toBeVisible();
  await screen.getByRole("tab", { name: labels.floor_timeline, exact: true }).click();
  await screen.getByRole("button", { name: labels.floor_previous, exact: true }).click();
  await expect
    .element(screen.getByLabelText(labels.floor_date, { exact: true }))
    .toHaveValue(moveDate(data.date, -1));
  await screen.getByRole("button", { name: labels.floor_now, exact: true }).click();
  await expect
    .element(screen.getByLabelText(labels.floor_date, { exact: true }))
    .toHaveValue(storeDate(Date.now()));
  await viewport.getByRole("button", { name: labels.admin_open_table, exact: true }).click();
  await expect.element(screen.getByRole("heading", { name: "空卓を開く" })).toBeVisible();
  expect(router.state.location.pathname).toBe(
    "/admin/stores/tablecast-komorebi/tables/tablecast-t10/open",
  );
});

it("続きの失敗を再試行し、背景再取得でも既存の帯・フォーカス・横位置を維持する", async () => {
  let fail = true;
  const older = {
    ...initial.sessions[0],
    id: "tablecast-older",
    guestCount: 2,
    status: "closed" as const,
    openedAt: startAt + 7 * hour,
    closedAt: startAt + 8 * hour,
  };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/timeline")) throw new Error(`未定義の要求: ${url.pathname}`);
    if (!url.searchParams.has("beforeId")) return Response.json(initial);
    return fail
      ? Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 })
      : Response.json({ ...initial, sessions: [older], nextCursor: null });
  });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  const options = timelineOptions("tablecast-komorebi", initial.date);
  client.setQueryData(options.queryKey, { pages: [initial], pageParams: [null] });
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <FloorTimeline
          storeId="tablecast-komorebi"
          date={initial.date}
          initialNow={initial.observedAt}
          tables={[{ ...table, tableId: "tablecast-t03" }]}
          vacantTables={[]}
          onDateChange={vi.fn<(date: string) => void>()}
          onSelect={vi.fn<(id: string) => void>()}
          onOpen={vi.fn<(table: { id: string; name: string }) => void>()}
        />
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    scrollRestoration: true,
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  const viewport = screen.getByRole("region", { name: "タイムライン", exact: true });
  const band = viewport.getByRole("button", { name: /^T03 · 4 / });
  await expect.element(band).toBeVisible();
  await screen.getByRole("button", { name: "続きを読み込む", exact: true }).click();
  await expect.element(screen.getByRole("alert")).toBeVisible();
  await expect.element(band).toBeVisible();
  fail = false;
  await screen.getByRole("button", { name: "再試行", exact: true }).click();
  await expect.element(viewport.getByRole("button", { name: /^T03 · 2 / })).toBeInTheDocument();
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  viewport.element().scrollLeft = 650;
  expect(viewport.element().scrollLeft).toBe(650);
  band.element().focus({ preventScroll: true });
  await client.invalidateQueries({ queryKey: options.queryKey });
  await expect.element(band).toHaveFocus();
  expect(viewport.element().scrollLeft).toBe(650);
  await expect
    .element(screen.getByRole("button", { name: "続きを読み込む", exact: true }))
    .not.toBeInTheDocument();
});
