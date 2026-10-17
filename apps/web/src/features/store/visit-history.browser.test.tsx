import type { ClosedSessionSummary, TableEvent } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import { SessionActivity } from "./session-activity";
import { VisitHistory } from "./visit-history";
import "../../styles.css";

let client: QueryClient;
let unexpected: string[];
let initialViewport: { width: number; height: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  try {
    await cleanup();
    client.clear();
    vi.unstubAllGlobals();
    if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

const visit = (id: string): ClosedSessionSummary => ({
  id,
  tableId: "tablecast-table",
  tableName: id,
  locale: "ja",
  guestCount: 2,
  openedAt: Date.UTC(2026, 8, 5, 14, 30),
  closedAt: Date.UTC(2026, 8, 5, 16),
  bill: {
    orderedTotal: 3000,
    adjustmentTotal: -100,
    paidTotal: 2900,
    due: 0,
    cartTotal: 0,
    planTotal: 0,
  },
});
const event = (cursor: number): TableEvent => ({
  cursor,
  storeId: "tablecast-first",
  tableSessionId: "tablecast-visit",
  kind: "voice.user",
  data: { text: `Original order ${cursor}`, locale: "en", role: "user" },
  createdAt: Date.UTC(2026, 8, 5, 15, cursor),
});

function History() {
  const [storeId, setStoreId] = useState("tablecast-first");
  const [selected, setSelected] = useState<string>();
  return (
    <>
      <button
        onClick={() => {
          setStoreId("tablecast-second");
          setSelected(undefined);
        }}
      >
        店舗を切り替える
      </button>
      <VisitHistory storeId={storeId} onSelect={setSelected} />
      {selected && <SessionActivity storeId={storeId} sessionId={selected} closed />}
    </>
  );
}

it("日本語で履歴の初回待機中にも表を表示し、取得後も位置と横幅を保つ", async () => {
  const locale = "ja";
  await page.viewport(1024, 768);
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  unexpected = [];
  const release = Promise.withResolvers<Response>();
  const reached = Promise.withResolvers<void>();
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/admin/stores/tablecast-first/history") {
      reached.resolve();
      return release.promise;
    }
    unexpected.push(`${request.method} ${path}`);
    return Response.json({}, { status: 500 });
  });
  try {
    const screen = await render(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale={locale} persist={false}>
          <main className="space-y-6 p-6">
            <VisitHistory storeId="tablecast-first" onSelect={() => undefined} />
          </main>
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await reached.promise;
    const historyTable = screen.getByRole("table");
    await expect.element(historyTable).toBeVisible();
    await expect.element(screen.getByRole("status")).toBeVisible();
    const tableBefore = historyTable.element().getBoundingClientRect();
    release.resolve(
      Response.json({ sessions: [visit("tablecast-loaded-visit")], nextCursor: null }),
    );
    await expect
      .element(screen.getByRole("row").filter({ hasText: "tablecast-loaded-visit" }))
      .toBeVisible();
    const tableAfter = historyTable.element().getBoundingClientRect();
    expect({ x: tableAfter.x, y: tableAfter.y, width: tableAfter.width }).toEqual({
      x: tableBefore.x,
      y: tableBefore.y,
      width: tableBefore.width,
    });
    await expect.poll(() => document.querySelectorAll('[aria-busy="true"]').length).toBe(0);
  } finally {
    release.resolve(Response.json({ sessions: [], nextCursor: null }));
  }
});

it("日本語で履歴と古いログをcursorで辿り、店舗切替後へ前の行やcursorを持ち越さない", async () => {
  const locale = "ja";
  const labels = ja;
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  unexpected = [];
  const requests: URL[] = [];
  let olderFailed = true;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    requests.push(url);
    if (url.pathname.endsWith("/history")) {
      if (url.pathname.includes("tablecast-second"))
        return Response.json({ sessions: [visit("tablecast-other")], nextCursor: null });
      return url.searchParams.has("beforeId")
        ? Response.json({ sessions: [visit("tablecast-older")], nextCursor: null })
        : Response.json({
            sessions: [visit("tablecast-visit")],
            nextCursor: { closedAt: 100, id: "tablecast-visit" },
          });
    }
    if (url.pathname.endsWith("/events")) {
      if (!url.searchParams.has("before"))
        return Response.json({ events: [event(3), event(4)], nextBefore: 3 });
      return olderFailed
        ? Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 })
        : Response.json({ events: [event(1), event(2)], nextBefore: null });
    }
    unexpected.push(`${request.method} ${url.pathname}`);
    return Response.json({}, { status: 500 });
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <History />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  await screen.getByRole("button", { name: labels.admin_more_visits, exact: true }).click();
  await expect
    .element(screen.getByRole("row").filter({ hasText: "tablecast-older" }))
    .toBeVisible();
  const next = requests.find((url) => url.searchParams.has("beforeId"));
  expect(next?.searchParams.get("beforeId")).toBe("tablecast-visit");
  expect(next?.searchParams.get("beforeClosedAt")).toBe("100");
  await screen
    .getByRole("row")
    .filter({ hasText: "tablecast-visit" })
    .getByRole("button", { name: labels.admin_details })
    .click();
  await expect.element(screen.getByText("Original order 4", { exact: false })).toBeVisible();
  await screen.getByRole("button", { name: labels.admin_older_events, exact: true }).click();
  await expect.element(screen.getByRole("alert")).toBeVisible();
  await expect.element(screen.getByText("Original order 4", { exact: false })).toBeVisible();
  olderFailed = false;
  await screen.getByRole("button", { name: labels.common_retry, exact: true }).click();
  await expect
    .poll(() =>
      [...document.querySelectorAll("[data-event-cursor]")].map((item) =>
        item.getAttribute("data-event-cursor"),
      ),
    )
    .toEqual(["1", "2", "3", "4"]);
  expect(
    requests
      .filter((url) => url.pathname.endsWith("/events"))
      .map((url) => url.searchParams.get("before")),
  ).toEqual([null, "3", "3"]);
  expect(
    [...document.querySelectorAll("[data-ui='activity-log'] time")].map((item) =>
      item.getAttribute("datetime"),
    ),
  ).toEqual([1, 2, 3, 4].map((cursor) => new Date(event(cursor).createdAt).toISOString()));
  await expect
    .element(screen.getByRole("button", { name: labels.admin_older_events, exact: true }))
    .not.toBeInTheDocument();
  await screen.getByRole("button", { name: "店舗を切り替える" }).click();
  await expect
    .element(screen.getByRole("row").filter({ hasText: "tablecast-other" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("tablecast-visit", { exact: true }))
    .not.toBeInTheDocument();
  const switched = requests.find((url) => url.pathname.includes("tablecast-second"));
  expect(switched?.searchParams.has("beforeId")).toBe(false);
  expect(switched?.searchParams.has("beforeClosedAt")).toBe(false);
});
