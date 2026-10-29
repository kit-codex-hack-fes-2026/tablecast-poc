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
import { page, userEvent } from "vitest/browser";
import type { Billing } from "./billing-query";
import { LocaleProvider } from "../../i18n/locale";
import { PanelLayoutProvider } from "../../lib/panel-layout";
import "../../styles.css";
import { parseFlatSearch, stringifyFlatSearch } from "../../lib/router-search";
import { billingFixture } from "./billing-fixture";
import { billingSearchSchema } from "./billing-model";
import { BillingPage } from "./billing-page";
let client: QueryClient;
const initialViewport = { width: 1024, height: 768 };
afterEach(async () => {
  await cleanup();
  client?.clear();
  vi.unstubAllGlobals();
  await page.viewport(initialViewport.width, initialViewport.height);
});
async function show(data: Billing = billingFixture, locale: "en" | "ja" = "ja", fail = false) {
  let failed = false;
  const stores = [
    {
      id: data.storeId,
      name: data.organization.name,
      role: data.canManage ? "owner" : "member",
      organizationId: data.organization.id,
    },
    {
      id: "tablecast-new-store",
      name: "新組織",
      role: "member",
      organizationId: "tablecast-new-org",
    },
  ];
  const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async (input, init) => {
      const request = new Request(input, init),
        url = new URL(request.url);
      if (url.pathname === "/api/auth/organization/get-full-organization")
        return Response.json(null);
      if (url.pathname === "/api/admin/stores") return Response.json({ stores, locale });
      if (url.pathname.endsWith("/billing/invoices"))
        return Response.json({ invoices: [], next: null });
      if (url.pathname.startsWith("/api/auth/subscription/"))
        return Response.json({ message: "tablecast-test-payment-unavailable" }, { status: 503 });
      if (url.pathname.endsWith("/billing")) {
        if (fail && !failed) {
          failed = true;
          return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
        }
        return Response.json(data);
      }
      throw new Error(`未定義の要求: ${url.pathname}`);
    },
  );
  vi.stubGlobal("fetch", fetch);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["tablecast-session"], null);
  client.setQueryData(["tablecast-stores"], { stores, locale });
  const root = createRootRoute();
  const billing = createRoute({
    getParentRoute: () => root,
    path: "/billing/$organizationId",
    validateSearch: billingSearchSchema,
    component: () => {
      const { organizationId } = billing.useParams();
      return <BillingPage key={organizationId} organizationId={organizationId} />;
    },
  });
  const router = createRouter({
    parseSearch: parseFlatSearch,
    stringifySearch: stringifyFlatSearch,
    routeTree: root.addChildren([billing]),
    history: createMemoryHistory({ initialEntries: [`/billing/${data.organization.id}`] }),
  });
  await router.load();
  await page.viewport(initialViewport.width, initialViewport.height);
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <PanelLayoutProvider cookies="">
          <RouterProvider router={router} />
        </PanelLayoutProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { fetch, router };
}
it("ownerの利用明細・空の請求履歴を表示し、キーボードで絞り込める", async () => {
  const { fetch, router } = await show();
  await expect.element(page.getByRole("heading", { name: "スタンダード", level: 2 })).toBeVisible();
  await expect.element(page.getByText("¥420.25", { exact: true })).toBeVisible();
  await expect.element(page.getByText("今回の請求期間（日本時間）")).toBeVisible();
  await expect.element(page.getByText("次回の更新・請求予定日")).toBeVisible();
  expect(document.body.textContent).not.toContain("AIの準備が完了しています");
  await expect.element(page.getByText("請求書はまだありません")).toBeVisible();
  await page.viewport(1366, 1100);
  await page.screenshot({
    path: "../../../test-results/tablecast-billing-overview.png",
    fullPage: false,
  });
  await userEvent.click(page.getByRole("img", { name: "AI音声接客の時間", exact: true }));
  await userEvent.keyboard("{Home}");
  await page.screenshot({
    path: "../../../test-results/tablecast-billing-daily.png",
    fullPage: false,
  });
  await userEvent.click(page.getByRole("link", { name: "プランを比較・変更" }));
  await expect.element(page.getByRole("heading", { name: "プラン一覧・変更" })).toBeVisible();
  await page.screenshot({
    path: "../../../test-results/tablecast-billing-plans.png",
    fullPage: false,
  });
  const filter = page.getByRole("searchbox", { name: "卓名で絞り込み" });
  await userEvent.click(filter);
  await userEvent.type(filter, "T01");
  await expect.element(filter).toHaveFocus();
  await expect
    .poll(() => new URLSearchParams(router.state.location.searchStr).get("usageQ"))
    .toBe("T01");
  await expect.element(filter).toHaveAttribute("placeholder", "卓名で絞り込み");
  await expect
    .poll(() =>
      fetch.mock.calls.some(
        ([input, init]) =>
          new URL(new Request(input, init).url).searchParams.get("search") === "T01",
      ),
    )
    .toBe(true);
  await page.viewport(1366, 1100);
  await page.screenshot({
    path: "../../../test-results/tablecast-billing-owner.png",
    fullPage: false,
  });
});
it("無料プランは定期請求なしと示し、AIプランだけCheckoutへ進める", async () => {
  const { fetch } = await show({
    ...billingFixture,
    usage: { ...billingFixture.usage, aiState: "pending" },
    financial: {
      ...billingFixture.financial,
      subscription: null,
      currentCycle: null,
      checkoutRequired: true,
    },
  });
  await expect.element(page.getByRole("heading", { name: "無料プラン", level: 2 })).toBeVisible();
  await expect.element(page.getByText("月額0円・定期請求なし")).toBeVisible();
  await expect
    .element(page.getByText("AI音声接客は有料プランで利用できます。", { exact: true }))
    .toBeVisible();
  expect(document.body.textContent).not.toContain("次回の更新・請求予定日");
  expect(document.body.textContent).not.toContain("AI音声接客を設定しています");
  await userEvent.click(page.getByRole("button", { name: "スタンダードを申し込む" }));
  await expect
    .poll(() =>
      fetch.mock.calls.some(([input, init]) => {
        const request = new Request(input, init);
        return (
          request.method === "POST" &&
          new URL(request.url).pathname === "/api/auth/subscription/upgrade"
        );
      }),
    )
    .toBe(true);
  await expect.element(page.getByRole("heading", { name: "無料プラン", level: 2 })).toBeVisible();
});
it("無料への変更はStripeの契約管理へ進み、期間末と最終利用料を説明する", async () => {
  const { fetch } = await show();
  await expect.element(page.getByText("無料への変更・解約の方法", { exact: true })).toBeVisible();
  await userEvent.click(page.getByRole("button", { name: "無料へ変更・有料契約を解約" }));
  await expect
    .poll(() =>
      fetch.mock.calls.some(([input, init]) => {
        const request = new Request(input, init);
        return (
          request.method === "POST" &&
          new URL(request.url).pathname === "/api/auth/subscription/billing-portal"
        );
      }),
    )
    .toBe(true);
  expect(document.body.textContent).toContain("Stripeの契約画面でキャンセルを確定");
  expect(document.body.textContent).toContain("期間末にAI利用料を精算");
});
it("解約予約の終了日を示し、二重の無料変更を無効にする", async () => {
  await show({
    ...billingFixture,
    financial: {
      ...billingFixture.financial,
      subscription: { ...billingFixture.financial.subscription, cancelAtPeriodEnd: true },
    },
  });
  await expect
    .element(page.getByText("無料プランへの変更を予約済み", { exact: false }))
    .toBeVisible();
  await expect.element(page.getByText("有料プラン終了・最終精算予定日")).toBeVisible();
  await expect.element(page.getByRole("button", { name: "期間末に無料へ変更予定" })).toBeDisabled();
  await expect.element(page.getByRole("button", { name: "支払い・契約を管理" })).toBeEnabled();
});
it("memberには契約・料金・請求書を表示せず、請求APIを呼ばない", async () => {
  const { fetch } = await show({
    ...billingFixture,
    canManage: false,
    financial: null,
    daily: billingFixture.daily.map(({ day, seconds }) => ({ day, seconds })),
    visits: billingFixture.visits.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      storeId: row.storeId,
      tableName: row.tableName,
      startedAt: row.startedAt,
      demo: row.demo,
      responses: row.responses,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      seconds: row.seconds,
      final: row.final,
    })),
  });
  await expect.element(page.getByRole("heading", { name: "利用明細" })).toBeVisible();
  expect(document.body.textContent).not.toContain("今回の期間で使ったAI利用料");
  expect(document.body.textContent).not.toContain("現在のプラン");
  expect(
    fetch.mock.calls.some(([input, init]) => new Request(input, init).url.endsWith("/invoices")),
  ).toBe(false);
});
it("取得失敗から再試行し、狭い日本語画面でも操作できる", async () => {
  await show(
    { ...billingFixture, usage: { ...billingFixture.usage, aiState: "failed" } },
    "ja",
    true,
  );
  await page.viewport(390, 844);
  await userEvent.click(page.getByRole("button", { name: "もう一度試す" }));
  await expect.element(page.getByText("AI音声接客を開始できません")).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  await page.screenshot({
    path: "../../../test-results/tablecast-billing-narrow-ja.png",
    fullPage: true,
  });
});
it("組織切替で期間・検索・ページを初期化し、旧組織の遅い応答を表示しない", async () => {
  const { fetch } = await show();
  await expect.element(page.getByRole("heading", { name: "利用明細" })).toBeVisible();
  const billingLink = page
    .getByRole("complementary")
    .getByRole("region", { name: "店舗管理", exact: true })
    .getByRole("link", { name: "課金／請求", exact: true });
  await expect
    .element(billingLink)
    .toHaveAttribute("href", `/billing/${billingFixture.organization.id}`);
  await page.getByRole("button", { name: "利用状況の対象月: 2026年10月", exact: true }).click();
  await page.getByRole("button", { name: "2026年9月", exact: true }).click();
  await expect
    .poll(() =>
      fetch.mock.calls.some(
        ([input, init]) =>
          new URL(new Request(input, init).url).searchParams.get("month") === "2026-09",
      ),
    )
    .toBe(true);
  const oldResponse = Promise.withResolvers<Response>();
  fetch.mockImplementationOnce(() => oldResponse.promise);
  await userEvent.fill(page.getByRole("searchbox", { name: "卓名で絞り込み" }), "old-table");
  fetch.mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/auth/organization/set-active")
      return Response.json({ id: "tablecast-new-org", name: "新組織" });
    if (pathname === "/api/admin/stores")
      return Response.json({
        stores: [
          {
            id: "tablecast-new-store",
            name: "新組織",
            role: "member",
            organizationId: "tablecast-new-org",
          },
        ],
        locale: "ja",
      });
    if (pathname.endsWith("/billing/invoices")) return Response.json({ invoices: [], next: null });
    if (pathname.endsWith("/billing"))
      return Response.json({
        ...billingFixture,
        organization: { id: "tablecast-new-org", name: "新組織" },
        storeId: "tablecast-new-store",
        visits: [],
        financial: null,
      });
    throw new Error(`未定義の要求: ${pathname}`);
  });
  await userEvent.click(
    page.getByRole("complementary").getByRole("combobox", { name: "店舗", exact: true }),
  );
  await userEvent.click(page.getByRole("option", { name: /新組織/ }));
  await expect
    .poll(() =>
      fetch.mock.calls.some(([input, init]) => {
        const request = new Request(input, init);
        return (
          request.method === "POST" &&
          new URL(request.url).pathname === "/api/auth/organization/set-active"
        );
      }),
    )
    .toBe(true);
  await expect
    .element(page.getByRole("searchbox", { name: "卓名で絞り込み", exact: true }))
    .toHaveValue("");
  await expect
    .poll(() =>
      fetch.mock.calls.some(
        ([input, init]) =>
          new URL(new Request(input, init).url).pathname ===
          "/api/admin/organizations/tablecast-new-org/billing",
      ),
    )
    .toBe(true);
  await expect
    .element(page.getByRole("button", { name: "利用状況の対象月: 2026年10月", exact: true }))
    .toBeVisible();
  await expect.element(billingLink).toHaveAttribute("href", "/billing/tablecast-new-org");
  oldResponse.resolve(
    Response.json({
      ...billingFixture,
      organization: { id: "tablecast-billing-org", name: "古い応答" },
    }),
  );
  await expect.element(page.getByText("この期間のAI利用はありません")).toBeVisible();
  expect(document.body.textContent).not.toContain("古い応答");
});
it("狭い画面の店舗切替は送信中と失敗をナビ内に示し、入力を保って再試行できる", async () => {
  const { fetch, router } = await show();
  await page.viewport(390, 844);
  const filter = page.getByRole("searchbox", { name: "卓名で絞り込み" });
  await userEvent.fill(filter, "old-table");
  await expect.poll(() => client.isFetching()).toBe(0);
  const originalFetch = fetch.getMockImplementation();
  if (!originalFetch) throw new Error("HTTP fixtureがありません");
  const failedSwitch = Promise.withResolvers<Response>();
  let fail = true;
  fetch.mockImplementation(async (input, init) => {
    const pathname = new URL(new Request(input, init).url).pathname;
    if (pathname === "/api/auth/organization/set-active")
      return fail ? failedSwitch.promise : Response.json({ id: "tablecast-new-org" });
    if (pathname === "/api/admin/organizations/tablecast-new-org/billing")
      return Response.json({
        ...billingFixture,
        organization: { id: "tablecast-new-org", name: "新組織" },
        storeId: "tablecast-new-store",
        canManage: false,
        visits: [],
        financial: null,
      });
    return originalFetch(input, init);
  });
  try {
    await expect
      .element(page.getByRole("combobox", { name: "店舗", exact: true }))
      .not.toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "ナビゲーション", exact: true }));
    const navigation = page.getByRole("dialog", { name: "ナビゲーション", exact: true });
    const picker = navigation.getByRole("combobox", { name: "店舗", exact: true });
    await userEvent.click(picker);
    await userEvent.click(page.getByRole("option", { name: /新組織/ }));
    await expect.element(picker).toBeDisabled();
    await expect.element(navigation).toBeVisible();
    failedSwitch.resolve(Response.json({ message: "tablecast-test-unavailable" }, { status: 503 }));
    await expect.element(navigation.getByRole("alert")).toMatchTextContent("操作できませんでした");
    await expect.element(picker).toBeEnabled();
    await expect.element(picker).toMatchTextContent(billingFixture.organization.name);
    expect(router.state.location.pathname).toBe(`/billing/${billingFixture.organization.id}`);
    await userEvent.click(navigation.getByRole("button", { name: "閉じる", exact: true }));
    await expect.element(filter).toHaveValue("old-table");
    fail = false;
    await userEvent.click(page.getByRole("button", { name: "ナビゲーション", exact: true }));
    await expect.element(navigation.getByRole("alert")).toMatchTextContent("操作できませんでした");
    await userEvent.click(picker);
    await userEvent.click(page.getByRole("option", { name: /新組織/ }));
    await expect.poll(() => router.state.location.pathname).toBe("/billing/tablecast-new-org");
    await expect.element(navigation).not.toBeInTheDocument();
    await expect.element(filter).toHaveValue("");
    await expect
      .element(page.getByRole("button", { name: "利用状況の対象月: 2026年10月", exact: true }))
      .toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  } finally {
    failedSwitch.resolve(Response.json({}, { status: 503 }));
    await expect.poll(() => client.isMutating()).toBe(0);
  }
});
