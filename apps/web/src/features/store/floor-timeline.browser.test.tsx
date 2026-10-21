import { useState } from "react";
import { calendarInputValue } from "../../lib/calendar-input";
import type { TimelinePage } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { detectPlatform } from "@tanstack/react-hotkeys";
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
import { page, userEvent } from "vitest/browser";
import { TableCalendar } from "./table-calendar";
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

it("日本語で初回HTTP待機中も本番のフロア見出しと卓カードの枠を表示し、取得後も見出しの位置を保つ", async () => {
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
    await expect
      .element(screen.getByRole("region", { name: labels.floor_list, exact: true }))
      .toBeVisible();
    await expect.element(screen.getByRole("status").first()).toBeVisible();
    const before = heading.element().getBoundingClientRect();
    // 読込中から卓カードが入るまで、見出しと一覧の枠がずれない。
    const tableWidth = screen
      .getByRole("region", { name: labels.floor_list, exact: true })
      .element()
      .getBoundingClientRect().width;
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
    expect(
      screen
        .getByRole("region", { name: labels.floor_list, exact: true })
        .element()
        .getBoundingClientRect().width,
    ).toBe(tableWidth);
    await expect.poll(() => document.querySelectorAll('[aria-busy="true"]').length).toBe(0);
  } finally {
    release.resolve(Response.json({ tables: [], vacantTables: [], events: [], cursor: 0 }));
  }
});

it("日本語で同卓の閉卓・利用中を選び、戻ると時間軸と横位置を復元して空卓へ進む", async () => {
  const locale = "ja";
  const labels = ja;
  await page.viewport(1180, 820);
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
          onNavigate={(search, options) =>
            void router.navigate({
              to: "/admin/stores/$storeId/floor",
              params: { storeId: "tablecast-komorebi" },
              search,
              resetScroll: false,
              replace: options?.replace,
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
  await expect
    .element(screen.getByRole("searchbox", { name: labels.floor_search, exact: true }))
    .toHaveAttribute("placeholder", labels.floor_search_placeholder);
  await page.viewport(402, 874);
  await page.screenshot({ path: "../../../test-results/tablecast-floor-slider-iphone17.png" });
  const narrowCentre = viewport.element().scrollLeft + viewport.element().clientWidth / 2;
  await page.viewport(1180, 820);
  // 幅変更後のメディアクエリと中央時刻の復元を観測してから、次の横移動を行う。
  await expect
    .poll(
      () =>
        document.querySelector("[data-floor-table]")?.parentElement?.getBoundingClientRect().width,
    )
    .toBe(80);
  await expect
    .poll(() =>
      Math.abs(viewport.element().scrollLeft + viewport.element().clientWidth / 2 - narrowCentre),
    )
    .toBeLessThanOrEqual(0.5);
  const element = viewport.element();
  let reportedScroll = { left: element.scrollLeft, width: element.clientWidth };
  const observeScroll = () => {
    reportedScroll = { left: element.scrollLeft, width: element.clientWidth };
  };
  element.addEventListener("scroll", observeScroll);
  element.scrollLeft = 650;
  // Routerも監視するnative scrollの配送を待ってから、次のユーザー操作へ進む。
  await expect.poll(() => reportedScroll.left).toBe(650);
  const centre = element.clientWidth / 2;
  const zoom = screen.getByRole("slider", { name: labels.floor_zoom, exact: true });
  zoom.element().focus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.poll(() => router.state.location.search).toMatchObject({ zoom: 110 });
  await expect.element(zoom).toHaveAttribute("aria-valuenow", "110");
  await expect.element(zoom).toHaveFocus();
  // 奇数幅の中央は半端pxになるため、整数scrollLeftへの丸めも同じ時刻として扱う
  const zoomedCentre = (650 + centre) * 1.1;
  await expect
    .poll(() => Math.abs(reportedScroll.left + reportedScroll.width / 2 - zoomedCentre))
    .toBeLessThanOrEqual(0.5);
  const beforeWheel = viewport.element().scrollLeft;
  const pointer = viewport.element().clientWidth / 4;
  const wheelOptions = {
    bubbles: true,
    cancelable: true,
    clientX: viewport.element().getBoundingClientRect().left + pointer,
    metaKey: detectPlatform() === "mac",
    ctrlKey: detectPlatform() !== "mac",
  };
  const fineWheel = new WheelEvent("wheel", { ...wheelOptions, deltaY: -40 });
  viewport.element().dispatchEvent(fineWheel);
  expect(fineWheel.defaultPrevented).toBe(true);
  expect(router.state.location.search.zoom).toBe(110);
  const wheel = new WheelEvent("wheel", { ...wheelOptions, deltaY: -60 });
  viewport.element().dispatchEvent(wheel);
  expect(wheel.defaultPrevented).toBe(true);
  await expect.poll(() => router.state.location.search.zoom).toBe(120);
  const wheelOffset = wheel.clientX - viewport.element().getBoundingClientRect().left;
  await expect
    .poll(() =>
      Math.abs(reportedScroll.left - (((beforeWheel + wheelOffset) * 120) / 110 - wheelOffset)),
    )
    .toBeLessThanOrEqual(0.5);
  const restoredScrollLeft = viewport.element().scrollLeft;
  element.removeEventListener("scroll", observeScroll);
  // 修飾キーなし・時間軸の外のホイールはブラウザー本来の操作へ残す
  const ordinaryWheel = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -100 });
  viewport.element().dispatchEvent(ordinaryWheel);
  expect(ordinaryWheel.defaultPrevented).toBe(false);
  const outsideWheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY: -100,
    metaKey: detectPlatform() === "mac",
    ctrlKey: detectPlatform() !== "mac",
  });
  zoom.element().dispatchEvent(outsideWheel);
  expect(outsideWheel.defaultPrevented).toBe(false);
  expect(router.state.location.search.zoom).toBe(120);
  router.history.back();
  await expect.poll(() => router.state.location.search.zoom).toBe(110);
  await expect.poll(() => viewport.element().scrollLeft).toBe(beforeWheel);
  router.history.back();
  await expect.poll(() => router.state.location.search.zoom).toBeUndefined();
  await expect.poll(() => viewport.element().scrollLeft).toBe(650);
  router.history.forward();
  await expect.poll(() => router.state.location.search.zoom).toBe(110);
  await expect.poll(() => viewport.element().scrollLeft).toBe(beforeWheel);
  router.history.forward();
  await expect.poll(() => router.state.location.search.zoom).toBe(120);
  await expect.poll(() => viewport.element().scrollLeft).toBe(restoredScrollLeft);
  await screen.getByRole("button", { name: "T03の利用履歴を開く（2件）", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^T03 · 1 / })
    .click();
  await expect.element(screen.getByRole("heading", { name: closedId, exact: true })).toBeVisible();
  router.history.back();
  await expect.element(viewport).toBeVisible();
  await expect.poll(() => viewport.element().scrollLeft).toBe(restoredScrollLeft);
  expect(router.state.location.search.zoom).toBe(120);
  await screen.getByRole("button", { name: "T03の利用履歴を開く（2件）", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^T03 · 4 / })
    .click();
  await expect.element(screen.getByRole("heading", { name: table.id, exact: true })).toBeVisible();
  router.history.back();
  await screen.getByRole("tab", { name: labels.floor_list, exact: true }).click();
  await expect.element(screen.getByRole("button", { name: /^T03/ })).toBeVisible();
  await screen.getByRole("searchbox", { name: labels.floor_search, exact: true }).fill("T03");
  await screen.getByRole("tab", { name: labels.floor_timeline, exact: true }).click();
  await expect
    .element(screen.getByRole("searchbox", { name: labels.floor_search, exact: true }))
    .toHaveValue("T03");
  await screen.getByRole("button", { name: labels.collection_reset, exact: true }).click();
  await expect
    .element(screen.getByRole("searchbox", { name: labels.floor_search, exact: true }))
    .toHaveValue("");
  await screen.getByRole("button", { name: labels.floor_previous, exact: true }).click();
  await expect
    .element(screen.getByLabelText(labels.floor_date, { exact: true }))
    .toHaveValue(calendarInputValue(moveDate(data.date, -1), locale));
  await screen.getByRole("button", { name: labels.floor_now, exact: true }).click();
  await expect
    .element(screen.getByLabelText(labels.floor_date, { exact: true }))
    .toHaveValue(calendarInputValue(storeDate(Date.now()), locale));
  await screen.getByRole("button", { name: new RegExp(labels.admin_open_table) }).click();
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

it("日付変更の取得中もカレンダーの面積と操作フォーカスを保ち、前日の来店を新しい日付へ表示しない", async () => {
  const pending = Promise.withResolvers<Response>();
  vi.stubGlobal("fetch", () => pending.promise);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(timelineOptions("tablecast-komorebi", initial.date).queryKey, {
    pages: [{ ...initial, nextCursor: null }],
    pageParams: [null],
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: function Timeline() {
        const [date, setDate] = useState(initial.date);
        return (
          <FloorTimeline
            storeId="tablecast-komorebi"
            date={date}
            initialNow={initial.observedAt + 24 * hour}
            tables={[{ ...table, tableId: "tablecast-t03" }]}
            vacantTables={[{ id: "tablecast-t10", name: "T10" }]}
            onDateChange={setDate}
            onSelect={() => {}}
            onOpen={() => {}}
          />
        );
      },
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  try {
    const screen = await render(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale="ja" persist={false}>
          <RouterProvider router={router} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    const timeline = screen.getByRole("region", { name: ja.floor_timeline, exact: true });
    const previousDayBand = timeline.getByRole("button", { name: /^T03 · 4 / });
    await expect.element(previousDayBand).toBeVisible();
    await expect.element(previousDayBand).not.toHaveAccessibleName(/日本語|時間制限なし/);
    const initialHeight = timeline.element().getBoundingClientRect().height;
    const next = screen.getByRole("button", { name: ja.floor_next, exact: true });
    await next.click();
    await expect.element(timeline).toHaveAttribute("aria-busy", "true");
    await expect.element(next).toHaveFocus();
    await expect
      .element(timeline.getByRole("button", { name: /^T03 · 4 / }))
      .not.toBeInTheDocument();
    expect(timeline.element().getBoundingClientRect().height).toBe(initialHeight);
    pending.resolve(
      Response.json({
        ...initial,
        date: moveDate(initial.date, 1),
        startAt: initial.startAt + 24 * hour,
        endAt: initial.endAt + 24 * hour,
        sessions: [],
        nextCursor: null,
      }),
    );
    await expect.element(timeline).toHaveAttribute("aria-busy", "false");
    await expect.element(next).toHaveFocus();
    expect(timeline.element().getBoundingClientRect().height).toBe(initialHeight);
  } finally {
    pending.resolve(Response.json({ ...initial, sessions: [], nextCursor: null }));
  }
});

it("12卓の行を3端末幅で見渡し、帯の詳細はhover・focus・クリックで確認できる", async () => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const dense = Array.from({ length: 12 }, (_, index) => ({
    ...table,
    id: `tablecast-visit-${index}`,
    tableId: `tablecast-table-${index}`,
    tableName: `T${String(index + 1).padStart(2, "0")}`,
    guestCount: (index % 5) + 1,
    locale: index === 0 ? ("en" as const) : ("ja" as const),
    openedAt: startAt + (index === 11 ? 10.5 : 8 + index / 8) * hour,
    staffCalled: index === 0,
    billRequested: index === 1,
    voiceState: index === 2 ? ("error" as const) : ("stopped" as const),
    plan:
      index < 3
        ? {
            id: `tablecast-time-plan-${index}`,
            startedAt: initial.observedAt - (index === 0 ? 60 : index === 1 ? 90 : 100) * 60_000,
            rules: {
              id: "tablecast-plan",
              text: {
                ja: {
                  displayName: "飲み放題90分",
                  speechName: "飲み放題90分",
                  description: "",
                  aliases: [],
                },
                en: {
                  displayName: "90-minute drinks plan",
                  speechName: "90-minute drinks plan",
                  description: "",
                  aliases: [],
                },
              },
              pricePerPerson: 2000,
              durationMinutes: 90,
              lastOrderMinutesBeforeEnd: 15,
              productIds: [],
              categoryIds: [],
              tags: [],
              maxPerOrder: 5,
              maxTotalPerPerson: 20,
              intervalSeconds: 0,
              excludedOptionIds: [],
              includedOptionSurcharge: false,
            },
          }
        : null,
  }));
  const sessions = dense.map((visit) => ({
    id: visit.id,
    tableId: visit.tableId,
    guestCount: visit.guestCount,
    status: "open" as const,
    openedAt: visit.openedAt,
    closedAt: null,
  }));
  const historical = {
    id: "tablecast-previous-visit",
    tableId: "tablecast-table-0",
    guestCount: 6,
    status: "closed" as const,
    openedAt: startAt + 7 * hour,
    closedAt: startAt + 8 * hour,
  };
  const selected = vi.fn<(id: string) => void>();
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <main className="p-4">
          <TableCalendar
            page={initial}
            sessions={[...sessions, historical]}
            tables={dense}
            vacantTables={[]}
            now={initial.observedAt}
            onOpen={() => {}}
            onSelect={selected}
          />
        </main>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  const viewport = screen.getByRole("region", { name: ja.floor_timeline, exact: true });
  await expect.element(viewport).toBeVisible();
  for (const [name, width, height] of [
    ["iphone17", 402, 874],
    ["ipad11", 1180, 820],
    ["macbook14", 1512, 982],
  ] as const) {
    await page.viewport(width, height);
    const rows = Array.from(document.querySelectorAll<HTMLElement>("[data-floor-row]"));
    expect(rows).toHaveLength(12);
    expect(rows.every((row) => row.getBoundingClientRect().height === 64)).toBe(true);
    const nameCell = document.querySelector<HTMLElement>("[data-floor-table]");
    const historyCell = document.querySelector<HTMLElement>("[data-floor-history]");
    if (!nameCell || !historyCell) throw new Error("卓名・利用履歴の列がありません");
    expect(nameCell.textContent).toBe("T01");
    expect(nameCell.getBoundingClientRect().right).toBeLessThanOrEqual(
      viewport.element().getBoundingClientRect().left,
    );
    expect(historyCell.getBoundingClientRect().left).toBeGreaterThanOrEqual(
      viewport.element().getBoundingClientRect().right,
    );
    expect(getComputedStyle(nameCell).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(historyCell).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(nameCell.getBoundingClientRect().width).toBeLessThanOrEqual(width === 402 ? 56 : 112);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
    await page.screenshot({ path: `../../../test-results/tablecast-floor-dense-${name}.png` });
  }
  const band = viewport.getByRole("button", { name: /^T01 · 1 / });
  // 時間制の終了予定ではなく、実際に利用した4時間の幅を保つ
  expect(band.element().getBoundingClientRect().width).toBeCloseTo(384, 0);
  await expect.element(band.getByText("English", { exact: true })).toBeInTheDocument();
  await expect.element(band.getByText("残り30分", { exact: true })).toBeVisible();
  await expect.element(band).toHaveAccessibleName(/English/);
  await expect.element(band).toHaveAccessibleName(/残り30分/);
  await expect
    .element(
      viewport.getByRole("button", { name: /^T02 · 2 / }).getByText("残り0分", { exact: true }),
    )
    .toBeInTheDocument();
  await expect
    .element(
      viewport.getByRole("button", { name: /^T03 · 3 / }).getByText("10分超過", { exact: true }),
    )
    .toBeInTheDocument();
  await expect
    .element(
      viewport
        .getByRole("button", { name: /^T04 · 4 / })
        .getByText(ja.floor_limit_unlimited, { exact: true }),
    )
    .toBeInTheDocument();
  const compactBand = viewport.getByRole("button", { name: /^T12 · 2 / });
  await expect.element(compactBand).toHaveAccessibleName(/日本語/);
  const compactFlag = compactBand.element().querySelector("img");
  if (!compactFlag) throw new Error("短い利用バーに言語の旗がありません");
  await expect.element(compactFlag).toBeVisible();
  // 長い帯の左端が卓名列の裏へ隠れた状態でも、見えている部分への実ポインター操作で横位置を変えない。
  viewport.element().scrollLeft = 1000;
  const beforePreview = viewport.element().scrollLeft;
  const visiblePoint = () => ({
    x: Math.max(
      8,
      viewport.element().getBoundingClientRect().left +
        16 -
        band.element().getBoundingClientRect().left,
    ),
    y: 24,
  });
  await band.hover({ position: visiblePoint() });
  await expect.element(page.getByRole("dialog")).toBeVisible();
  expect(viewport.element().scrollLeft).toBe(beforePreview);
  await expect
    .element(page.getByRole("dialog").getByText(ja.admin_due, { exact: true }))
    .toBeVisible();
  await page.screenshot({ path: "../../../test-results/tablecast-floor-band-detail.png" });
  await userEvent.keyboard("{Escape}");
  await expect.element(band).toHaveFocus();
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  // focus中の長い帯も、固定された卓名列を覆わない。
  const tableCell = document.querySelector("[data-floor-table]");
  if (!tableCell) throw new Error("卓名の固定列がありません");
  const cellBounds = tableCell.getBoundingClientRect();
  expect(
    tableCell.contains(document.elementFromPoint(cellBounds.left + 40, cellBounds.top + 32)),
  ).toBe(true);
  viewport.element().focus();
  band.element().focus({ preventScroll: true });
  await expect.element(page.getByRole("dialog")).toBeVisible();
  expect(viewport.element().scrollLeft).toBe(beforePreview);
  await userEvent.keyboard("{Escape}");
  await band.click({ position: visiblePoint() });
  await expect.element(page.getByRole("dialog")).toBeVisible();
  expect(viewport.element().scrollLeft).toBe(beforePreview);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: ja.floor_open_details, exact: true })
    .click();
  expect(selected).toHaveBeenCalledWith(dense[0]?.id);
  await userEvent.keyboard("{Escape}");
  const pastBand = viewport.getByRole("button", { name: /^T01 · 6 / });
  await expect.element(pastBand.getByText("English", { exact: true })).not.toBeInTheDocument();
  await expect
    .element(pastBand.getByText(ja.floor_limit_unlimited, { exact: true }))
    .not.toBeInTheDocument();
  viewport.element().focus();
  pastBand.element().focus({ preventScroll: true });
  await expect.element(page.getByRole("dialog")).toBeVisible();
  await expect
    .element(page.getByRole("dialog").getByText(ja.floor_limit_unknown, { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("dialog").getByText("English", { exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(page.getByRole("dialog").getByText(ja.floor_limit_unlimited, { exact: true }))
    .not.toBeInTheDocument();
});
