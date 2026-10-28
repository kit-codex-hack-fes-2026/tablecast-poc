import type { TimelinePage } from "@tablecast/api/schema";
import { detectPlatform } from "@tanstack/react-hotkeys";
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
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import { calendarInputValue } from "../../lib/calendar-input";
import { fixtureValue } from "../../test-support/fixture-value";
import { table } from "../../test-support/tablecast-fixtures";
import { Floor, FloorPending } from "./floor";
import { floorSearchSchema, moveDate, storeDate } from "./floor-model";
import { floorOptions } from "./floor-query";
import { fixture, hour, initial, startAt } from "./test-support/floor-timeline-fixture";
import { timelineOptions } from "./timeline-query";
import "../../styles.css";

it("日本語で初回HTTP待機中も本番のフロア見出しと卓カードの枠を表示し、取得後も見出しの位置を保つ", async () => {
  const locale = "ja";
  const labels = ja;
  await page.viewport(1024, 768);
  fixture.client = new QueryClient({
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
    loader: () => fixture.client.ensureQueryData(floorOptions("tablecast-komorebi")),
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
      <QueryClientProvider client={fixture.client}>
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
        ...fixtureValue(initial.sessions[0]),
        id: closedId,
        guestCount: 1,
        status: "closed",
        closedAt: startAt + 10 * hour,
      },
      fixtureValue(initial.sessions[0]),
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
  fixture.client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  fixture.client.setQueryData(floorOptions("tablecast-komorebi").queryKey, {
    store: { id: "tablecast-komorebi", name: "こもれび", role: "owner" },
    tables: [{ ...table, tableId: "tablecast-t03", events: [] }],
    vacantTables: [{ id: "tablecast-t10", name: "T10" }],
    events: [],
    cursor: table.cursor,
  });
  fixture.client.setQueryData(timelineOptions("tablecast-komorebi", data.date).queryKey, {
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
    <QueryClientProvider client={fixture.client}>
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

vi.mock("../store/store-context", () => ({ useStore: () => ({ id: "tablecast-komorebi" }) }));
