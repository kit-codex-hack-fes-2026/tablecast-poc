import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import { table } from "../../test-support/tablecast-fixtures";
import "../../styles.css";
import { moveDate } from "./floor-model";
import { FloorTimeline } from "./floor-timeline";
import { TableCalendar } from "./table-calendar";
import { fixture, hour, initial, startAt } from "./test-support/floor-timeline-fixture";
import { timelineOptions } from "./timeline-query";

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
  fixture.client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  const options = timelineOptions("tablecast-komorebi", initial.date);
  fixture.client.setQueryData(options.queryKey, { pages: [initial], pageParams: [null] });
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
    <QueryClientProvider client={fixture.client}>
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
  await fixture.client.invalidateQueries({ queryKey: options.queryKey });
  await expect.element(band).toHaveFocus();
  expect(viewport.element().scrollLeft).toBe(650);
  await expect
    .element(screen.getByRole("button", { name: "続きを読み込む", exact: true }))
    .not.toBeInTheDocument();
});

it("日付変更の取得中もカレンダーの面積と操作フォーカスを保ち、前日の来店を新しい日付へ表示しない", async () => {
  const pending = Promise.withResolvers<Response>();
  vi.stubGlobal("fetch", () => pending.promise);
  fixture.client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  fixture.client.setQueryData(timelineOptions("tablecast-komorebi", initial.date).queryKey, {
    pages: [{ ...initial, nextCursor: null }],
    pageParams: [null],
  });
  const router = createRouter({
    routeTree: createRootRoute({
      component: Timeline,
    }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  try {
    const screen = await render(
      <QueryClientProvider client={fixture.client}>
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
  fixture.client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
                  transliteration: "飲み放題90分",
                  description: "",
                  aliases: [],
                },
                en: {
                  displayName: "90-minute drinks plan",
                  speechName: "90-minute drinks plan",
                  transliteration: "90-minute drinks plan",
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
    <QueryClientProvider client={fixture.client}>
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

function Timeline() {
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
}

vi.mock("../store/store-context", () => ({ useStore: () => ({ id: "tablecast-komorebi" }) }));
