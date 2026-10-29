import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { customerPointsOptions } from "./customer-points-query";
import { CustomerShell } from "./customer-shell";
import { CustomerStore } from "./customer-store";

let client: QueryClient;
let initialViewport: { height: number; width: number };
let paths: string[];
let active: boolean;
let pointsFail: boolean;
let writes: unknown[];
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
  paths = [];
  writes = [];
  active = true;
  pointsFail = false;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    paths.push(path);
    const match = /^\/api\/customer\/stores\/([^/]+)(.*)$/.exec(path);
    if (!match) throw new Error(`未定義の要求: ${path}`);
    const [, storeId, action] = match;
    if (action === "")
      return Response.json({
        store: {
          id: storeId,
          name:
            storeId === "tablecast-first"
              ? "卓上喫茶 / Tablecast Coffee and Seasonal Kitchen"
              : "川沿い食堂",
        },
        membership: active
          ? {
              id: `${storeId}-member`,
              active: true,
              joinedAt: 1782903600000,
              revision: 7,
              shareCompanions: true,
              useMemories: true,
              saveMemories: true,
            }
          : null,
      });
    if (action === "/points")
      return pointsFail
        ? Response.json({ error: { code: "UNAVAILABLE", message: "一時停止" } }, { status: 503 })
        : Response.json({
            balance: storeId === "tablecast-first" ? 1280 : 35,
            totals: { visits: 4, allocatedYen: 8000 },
            entries: [],
            nextCursor: null,
          });
    if (action === "/coupons")
      return Response.json({
        coupons:
          storeId === "tablecast-first"
            ? [
                {
                  id: "coupon",
                  state: "available",
                  inDate: true,
                  rules: {
                    title: {
                      ja: "季節のデザートを一皿",
                      en: "A seasonal dessert to enjoy on your next visit",
                    },
                  },
                },
              ]
            : [],
        nextCursor: null,
      });
    if (action === "/visits")
      return Response.json({
        visits:
          storeId === "tablecast-first"
            ? [
                {
                  sessionId: "visit",
                  tableName: "窓際のテーブル",
                  openedAt: 1782903600000,
                  status: "open",
                  leftAt: null,
                  participants: [{ name: "佐藤 晴香" }],
                },
              ]
            : [],
        nextCursor: null,
      });
    if (action === "/memories") return Response.json({ memories: [], nextCursor: null });
    if (action === "/preferences" || action === "/leave") {
      writes.push(await request.json());
      return Response.json(
        { error: { code: "CONFLICT", message: "設定が変更されました" } },
        { status: 409 },
      );
    }
    throw new Error(`未定義の要求: ${path}`);
  });
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  await page.viewport(initialViewport.width, initialViewport.height);
});

async function show(locale: "en" | "ja" = "ja", initial = "/member/tablecast-first") {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  const root = createRootRoute();
  const store = createRoute({
    getParentRoute: () => root,
    path: "/member/$storeId",
    component: () => (
      <CustomerShell>
        <CustomerStore storeId={store.useParams().storeId} />
      </CustomerShell>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([store]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return router;
}

it.each(["ja", "en"] as const)(
  "%sで残高・券・来店の順に表示し、390pxで店舗の記録へ進める",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    await page.viewport(390, 844);
    await show(locale);
    await expect.element(page.getByText("1,280 pt", { exact: true })).toBeVisible();
    await expect
      .element(
        page.getByText(
          locale === "ja"
            ? "季節のデザートを一皿"
            : "A seasonal dessert to enjoy on your next visit",
          { exact: true },
        ),
      )
      .toBeVisible();
    const balance = page.getByRole("heading", { name: labels.customer_points_balance }).element();
    const visits = page.getByRole("heading", { name: labels.customer_visits }).element();
    expect(balance.compareDocumentPosition(visits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
    await expect
      .element(page.getByRole("link", { name: labels.customer_memories, exact: true }))
      .toHaveAttribute("href", "/member/tablecast-first/memories");
    await page.screenshot({ path: `../../../test-results/tablecast-member-card-${locale}.png` });
  },
);

it("ポイントの初回失敗を残高0と扱わず、取得できた保有券・来店を表示する", async () => {
  pointsFail = true;
  await show();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(page.getByText("0 pt", { exact: true })).not.toBeInTheDocument();
  await expect.element(page.getByText("季節のデザートを一皿", { exact: true })).toBeVisible();
  await expect.element(page.getByRole("link", { name: /窓際のテーブル/ })).toBeVisible();
});

it("ポイントの再取得失敗でも残高・保有券・来店を保持する", async () => {
  await show();
  await expect.element(page.getByText("1,280 pt", { exact: true })).toBeVisible();
  pointsFail = true;
  await client.invalidateQueries({
    queryKey: customerPointsOptions("tablecast-first").queryKey,
    exact: true,
  });
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(page.getByText("1,280 pt", { exact: true })).toBeVisible();
  await expect.element(page.getByText("季節のデザートを一皿", { exact: true })).toBeVisible();
  await expect.element(page.getByRole("link", { name: /窓際のテーブル/ })).toBeVisible();
});

it("同意前の店舗ホームはポイント・券・来店を取得しない", async () => {
  active = false;
  await show();
  await expect
    .element(page.getByRole("button", { name: ja.customer_enrol, exact: true }))
    .toBeVisible();
  expect(paths.every((path) => path === "/api/customer/stores/tablecast-first")).toBe(true);
});

it("店舗を切り替えると残高・保有券と設定の確認状態を引き継がない", async () => {
  const router = await show();
  await page.getByText(ja.customer_preferences, { exact: true }).click();
  await page.getByRole("checkbox", { name: ja.customer_save_memories, exact: true }).click();
  await page.getByRole("button", { name: ja.customer_leave, exact: true }).click();
  await expect.element(page.getByRole("button", { name: ja.customer_leave_confirm })).toBeVisible();
  await router.navigate({ to: "/member/$storeId", params: { storeId: "tablecast-second" } });
  await expect.element(page.getByRole("heading", { name: "川沿い食堂" })).toBeVisible();
  await expect.element(page.getByText("35 pt", { exact: true })).toBeVisible();
  await expect
    .element(page.getByText("季節のデザートを一皿", { exact: true }))
    .not.toBeInTheDocument();
  await page.getByText(ja.customer_preferences, { exact: true }).click();
  await expect
    .element(page.getByRole("checkbox", { name: ja.customer_save_memories, exact: true }))
    .toBeChecked();
  await expect
    .element(page.getByRole("button", { name: ja.customer_leave_confirm }))
    .not.toBeInTheDocument();
});

it("設定をキーボードで開き、競合時も変更した入力とrevisionを保持する", async () => {
  await show();
  const summary = page.getByText(ja.customer_preferences, { exact: true });
  await expect.element(summary).toBeVisible();
  for (let count = 0; count < 20 && document.activeElement !== summary.element(); count++)
    await userEvent.keyboard("{Tab}");
  await expect.element(summary).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await page.getByRole("checkbox", { name: ja.customer_save_memories, exact: true }).click();
  await page.getByRole("button", { name: ja.customer_save_preferences }).click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect
    .element(page.getByRole("checkbox", { name: ja.customer_save_memories, exact: true }))
    .not.toBeChecked();
  expect(writes).toEqual([
    { revision: 7, shareCompanions: true, useMemories: true, saveMemories: false },
  ]);
});

it("退会は明示確認後だけrevision付きで送信し、失敗後も確認内容を保持する", async () => {
  await show();
  await page.getByText(ja.customer_preferences, { exact: true }).click();
  await page.getByRole("button", { name: ja.customer_leave, exact: true }).click();
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: ja.customer_leave_confirm, exact: true }).click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  expect(writes).toEqual([{ revision: 7 }]);
  await expect
    .element(page.getByRole("button", { name: ja.customer_leave_confirm, exact: true }))
    .toBeVisible();
  await expect.element(page.getByText(ja.customer_leave_notice, { exact: true })).toBeVisible();
});

it("退会確認を取り消すと保存せず元の操作へ戻る", async () => {
  await show();
  await page.getByText(ja.customer_preferences, { exact: true }).click();
  const trigger = page.getByRole("button", { name: ja.customer_leave, exact: true });
  await trigger.click();
  await page.getByRole("button", { name: ja.common_cancel, exact: true }).click();
  await expect.element(trigger).toHaveFocus();
  await expect
    .element(page.getByRole("button", { name: ja.customer_leave_confirm }))
    .not.toBeInTheDocument();
  expect(writes).toEqual([]);
});
