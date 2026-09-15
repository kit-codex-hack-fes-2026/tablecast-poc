import type { TimelinePage } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { table } from "../../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../../i18n/locale";
import { FloorTimeline } from "./floor-timeline";
import { timelineOptions } from "./timeline-query";
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
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
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
      <LocaleProvider initialLocale="ja">
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
