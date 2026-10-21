import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { statisticsQuerySchema, type Locale } from "@tablecast/api/schema";
import { catalog, table, statisticsFixture } from "../../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../../i18n/locale";
import { MotionProvider } from "../../components/motion-provider";
import { PanelLayoutProvider } from "../../lib/panel-layout";
import { StoreShell } from "./store-shell";
import { StoreHome } from "./store-home";
import { StoreStatistics } from "./store-statistics";
import { statisticsSearchSchema } from "./statistics-query";
import { calendarInputValue } from "../../lib/calendar-input";
import "../../styles.css";

const storeId = statisticsFixture.storeId;
let client: QueryClient;
let requests: URL[];
let unexpected: string[];
let fail: boolean;
let empty: boolean;
let missing: boolean;
let statisticsGate: Promise<void> | undefined;
class TablecastSocket extends EventTarget {
  close() {}
}

beforeEach(() => {
  requests = [];
  unexpected = [];
  fail = false;
  empty = false;
  missing = false;
  statisticsGate = undefined;
  vi.stubGlobal("WebSocket", TablecastSocket);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.pathname.endsWith("/statistics")) {
      requests.push(url);
      await statisticsGate;
      const query = statisticsQuerySchema.parse(Object.fromEntries(url.searchParams));
      if (fail) return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
      return Response.json({
        ...statisticsFixture,
        ...query,
        storeId: url.pathname.split("/")[4],
        summary: {
          ...statisticsFixture.summary,
          ...(empty ? { sessions: 0, paidAmount: 0, guests: 0, orders: 0 } : {}),
          incompleteSnapshots: missing ? 1 : 0,
        },
        rows:
          query.view === "summary" || empty
            ? []
            : [
                {
                  productId: query.cursor ? "tablecast-product-b" : "tablecast-product-a",
                  optionId: query.view === "modifiers" ? "tablecast-option" : null,
                  name:
                    query.locale === "en"
                      ? "Seasonal special"
                      : query.cursor
                        ? "季節のおすすめ"
                        : "定番の商品",
                  quantity: 4,
                  orderingSessions: 3,
                  orderRate: 1 / 6,
                  planCoveredQuantity: 0,
                },
              ],
        nextCursor: query.view !== "summary" && !query.cursor && !empty ? "tablecast-next" : null,
      });
    }
    if (url.pathname === "/api/auth/organization/get-full-organization") return Response.json(null);
    if (url.pathname.endsWith("/catalog")) return Response.json(catalog);
    if (url.pathname.endsWith("/devices")) return Response.json({ devices: [], tables: [] });
    if (url.pathname.endsWith("/events")) return Response.json({ events: [], cursor: 0 });
    if (url.pathname === `/api/admin/stores/${storeId}`)
      return Response.json({
        store: { id: storeId, name: "統計試験店", role: "owner" },
        tables: [{ ...table, staffCalled: true, billRequested: false }],
        vacantTables: [{ id: "tablecast-vacant", name: "2番卓" }],
        cursor: 0,
        events: [],
      });
    unexpected.push(`${request.method} ${url.pathname}`);
    return Response.json({}, { status: 500 });
  });
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  await page.viewport(1024, 768);
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});

async function show({
  role = "owner",
  locale = "ja",
  initial = `/admin/stores/${storeId}/statistics`,
}: { role?: string; locale?: Locale; initial?: string } = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["tablecast-session"], null);
  client.setQueryData(["tablecast-stores"], {
    stores: [storeId, "tablecast-second-store"].map((id) => ({
      id,
      name: id === storeId ? "統計試験店" : "2号店",
      logo: null,
      role,
      organizationId: `${id}-org`,
    })),
  });
  const root = createRootRoute();
  const store = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
    component: () => <StoreShell storeId={store.useParams().storeId} />,
  });
  const statistics = createRoute({
    getParentRoute: () => store,
    path: "statistics",
    validateSearch: statisticsSearchSchema,
    component: function StatisticsPage() {
      const navigate = statistics.useNavigate();
      return (
        <StoreStatistics
          search={statistics.useSearch()}
          today="2026-10-19"
          onNavigate={(search) => void navigate({ search })}
        />
      );
    },
  });
  const home = createRoute({
    getParentRoute: () => store,
    path: "/",
    component: () => <StoreHome today="2026-10-19" />,
  });
  const floor = createRoute({
    getParentRoute: () => store,
    path: "floor",
    component: () => <h1>フロアの試験遷移先</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([store.addChildren([statistics, home, floor])]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  await router.load();
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <PanelLayoutProvider cookies="">
            <RouterProvider router={router} />
          </PanelLayoutProvider>
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return router;
}

it("商品集計の部分取得を明示し、続きの失敗でも取得済み行を保って再試行する", async () => {
  await show();
  await expect.element(page.getByText("¥61,200", { exact: true })).toBeVisible();
  const { promise, resolve: release } = Promise.withResolvers<void>();
  statisticsGate = promise;
  try {
    await page.getByRole("tab", { name: "商品別", exact: true }).click();
    await expect
      .element(page.getByRole("tab", { name: "商品別", exact: true }))
      .toHaveAttribute("aria-selected", "true");
    await expect.element(page.getByRole("tabpanel").getByRole("status")).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "期間を指定", exact: true }))
      .toBeVisible();
  } finally {
    release();
    statisticsGate = undefined;
  }
  await expect.element(page.getByRole("rowheader", { name: "定番の商品" })).toBeVisible();
  await expect.element(page.getByText("1 項目を表示中・続きがあります")).toBeVisible();
  fail = true;
  await userEvent.click(page.getByRole("button", { name: "次の30項目を表示" }));
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(page.getByRole("rowheader", { name: "定番の商品" })).toBeVisible();
  fail = false;
  await userEvent.click(page.getByRole("button", { name: "再試行", exact: true }));
  await expect.element(page.getByRole("rowheader", { name: "季節のおすすめ" })).toBeVisible();
  await expect.element(page.getByText("2 項目・すべて取得済み")).toBeVisible();
});

it("表示タブは期間を保ってURLを更新し、選択した集計だけ取得する", async () => {
  const router = await show({
    initial: `/admin/stores/${storeId}/statistics?period=week&view=summary`,
  });
  const summary = page.getByRole("tab", { name: "概要", exact: true });
  await expect.element(summary).toHaveAttribute("aria-selected", "true");
  await expect.element(page.getByText("¥61,200", { exact: true })).toBeVisible();
  expect(requests.every((request) => request.searchParams.get("view") === "summary")).toBe(true);
  await page.getByRole("tab", { name: "商品別", exact: true }).click();
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({
      period: "week",
      view: "products",
    });
  await expect.element(page.getByRole("tab", { name: "商品別", exact: true })).toHaveFocus();
  await expect.element(page.getByRole("rowheader", { name: "定番の商品" })).toBeVisible();
  expect(requests.some((request) => request.searchParams.get("view") === "modifiers")).toBe(false);
  await userEvent.keyboard("{Home}{Enter}");
  await expect.element(summary).toHaveAttribute("aria-selected", "true");
  await expect.element(summary).toHaveFocus();
  await expect.element(page.getByRole("tabpanel", { name: "概要", exact: true })).toBeVisible();
  await expect.element(page.getByRole("rowheader", { name: "定番の商品" })).not.toBeInTheDocument();
  expect(router.state.location.search.period).toBe("week");
});

it("指定期間はJSTの終了日を含めてURLに残し、別店舗では前店舗の集計を使わない", async () => {
  const router = await show();
  await userEvent.click(page.getByRole("button", { name: "期間を指定", exact: true }));
  await userEvent.fill(page.getByLabelText("開始日", { exact: true }), "2026-09-30");
  await userEvent.fill(page.getByLabelText("終了日（この日を含む）"), "2026-10-02");
  await userEvent.click(page.getByRole("button", { name: "期間を適用" }));
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({ from: "2026-09-30", to: "2026-10-02", period: "custom" });
  await expect
    .poll(() => requests.at(-1)?.searchParams.get("to"))
    .toBe("2026-10-03T00:00:00+09:00");
  expect(requests.at(-1)?.searchParams.get("from")).toBe("2026-09-30T00:00:00+09:00");
  empty = true;
  await router.navigate({
    to: "/admin/stores/$storeId/statistics",
    params: { storeId: "tablecast-second-store" },
    search: { period: "today", view: "summary" },
  });
  await expect.element(page.getByText("この期間に終了した来店はありません。")).toBeVisible();
  expect(requests.at(-1)?.pathname).toBe("/api/admin/stores/tablecast-second-store/statistics");
  expect(document.body.textContent).not.toContain("¥61,200");
});

it("失敗を0件に見せず、再取得失敗時は直前の集計と基準時刻を残す", async () => {
  fail = true;
  await show();
  await expect.element(page.getByRole("alert")).toBeVisible();
  expect(document.body.textContent).not.toContain("この期間に終了した来店はありません。");
  fail = false;
  await userEvent.click(page.getByRole("button", { name: "再試行", exact: true }));
  await expect.element(page.getByText("¥61,200", { exact: true })).toBeVisible();
  fail = true;
  await userEvent.click(page.getByRole("button", { name: "最新の集計に更新" }));
  await expect
    .element(page.getByText("更新できませんでした。直前に取得した集計を表示しています。"))
    .toBeVisible();
  await expect.element(page.getByText("¥61,200", { exact: true })).toBeVisible();
});

it("memberは統計を取得せず、ホームにも管理者向け導入案内を出さない", async () => {
  const router = await show({ role: "member" });
  await expect
    .element(page.getByText("統計は店舗のオーナー・管理者が確認できます。"))
    .toBeVisible();
  expect(requests).toEqual([]);
  await router.navigate({ to: "/admin/stores/$storeId", params: { storeId } });
  await expect.element(page.getByRole("heading", { name: "ホーム", exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  expect(document.body.textContent).not.toContain("ChatGPTとつなぐ");
  await userEvent.click(page.getByRole("link", { name: /スタッフ呼出/ }));
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({ filter: "called", view: "list" });
});

it("英語の狭い画面でも欠損と数量表を確認でき、更新後も操作を続けられる", async () => {
  await page.viewport(390, 844);
  missing = true;
  await show({ locale: "en", initial: `/admin/stores/${storeId}/statistics?view=modifiers` });
  await expect.element(page.getByRole("rowheader", { name: /Seasonal special/ })).toBeVisible();
  await expect.element(page.getByRole("note")).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  const region = page.getByRole("region", { name: "Statistics table" });
  region.element().focus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.poll(() => region.element().scrollLeft).toBeGreaterThan(0);
  await expect.element(region).toHaveFocus();
  await page.screenshot({
    path: "../../../test-results/tablecast-statistics-mobile-en.png",
    fullPage: true,
  });
});

it("ホームの準備状態は実データを使い、導入・商品・統計をリンクとして辿れる", async () => {
  await show({ initial: `/admin/stores/${storeId}` });
  await expect.element(page.getByText("公開中の商品があります", { exact: true })).toBeVisible();
  await expect
    .element(page.getByText("有効な登録済み端末はまだありません", { exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "接続方法を見る", exact: true }))
    .toHaveAttribute("href", "/account/integrations/plugins");
  await expect
    .element(page.getByRole("link", { name: "商品を確認する", exact: true }))
    .toHaveAttribute("href", `/admin/stores/${storeId}/menu/products`);
  await expect
    .element(page.getByRole("link", { name: "詳しい統計を見る", exact: true }))
    .toHaveAttribute("href", expect.stringContaining(`/admin/stores/${storeId}/statistics`));
});

it.each([
  { locale: "ja" as const, width: 1024, height: 768, name: "ホーム", plugin: "接続方法を見る" },
  { locale: "ja" as const, width: 1440, height: 1000, name: "ホーム", plugin: "接続方法を見る" },
  { locale: "en" as const, width: 390, height: 844, name: "Home", plugin: "See how to connect" },
])(
  "ホームは$locale / $width pxで操作と補助説明が欠けずに表示される",
  async ({ locale, width, height, name, plugin }) => {
    await page.viewport(width, height);
    await show({ locale, initial: `/admin/stores/${storeId}` });
    await expect.element(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expect
      .element(page.getByText(locale === "en" ? "JP¥61,200" : "¥61,200", { exact: true }))
      .toBeVisible();
    await expect.element(page.getByRole("link", { name: plugin, exact: true })).toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await page.screenshot({
      path: `../../../test-results/tablecast-home-${locale}-${width}.png`,
      fullPage: true,
    });
    page
      .getByRole("link", { name: plugin, exact: true })
      .element()
      .scrollIntoView({ block: "center" });
    await page.screenshot({
      path: `../../../test-results/tablecast-home-setup-${locale}-${width}.png`,
      fullPage: true,
    });
  },
);

it.each([390, 881])(
  "%s pxの期間指定はコンテナ幅に合わせて日付を縦に並べ省略しない",
  async (width) => {
    await page.viewport(width, 1000);
    await show({
      locale: "en",
      initial: `/admin/stores/${storeId}/statistics?period=custom&from=2026-09-23&to=2026-09-23`,
    });
    const from = page.getByRole("textbox", { name: "Start date", exact: true });
    const to = page.getByRole("textbox", { name: "End date (inclusive)", exact: true });
    await expect.element(from).toHaveValue(calendarInputValue("2026-09-23", "en"));
    await expect.element(to).toHaveValue(calendarInputValue("2026-09-23", "en"));
    for (const input of [from.element(), to.element()]) {
      expect(input.scrollWidth).toBeLessThanOrEqual(input.clientWidth);
    }
    expect(to.element().getBoundingClientRect().top).toBeGreaterThan(
      from.element().getBoundingClientRect().bottom,
    );
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: `../../../test-results/tablecast-statistics-dates-${width}.png`,
      fullPage: true,
    });
  },
);
