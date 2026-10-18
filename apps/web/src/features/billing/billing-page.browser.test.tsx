import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../i18n/locale";
import { PanelLayoutProvider } from "../../lib/panel-layout";
import { BillingPage } from "./billing-page";
import { billingFixture } from "./billing-fixture";
import type { Billing } from "./billing-query";
import "../../styles.css";
let client: QueryClient;
const initialViewport = { width: 1024, height: 768 };
afterEach(async () => {
  await cleanup();
  client?.clear();
  vi.unstubAllGlobals();
  document.documentElement.style.fontSize = "";
  await page.viewport(initialViewport.width, initialViewport.height);
});
async function show(data: Billing = billingFixture, locale: "ja" | "en" = "ja", fail = false) {
  let failed = false;
  const fetch = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async (input, init) => {
      const request = new Request(input, init),
        url = new URL(request.url);
      if (url.pathname === "/api/auth/organization/get-full-organization")
        return Response.json(null);
      if (url.pathname.endsWith("/billing/invoices"))
        return Response.json({ invoices: [], next: null });
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
  client.setQueryData(["tablecast-stores"], {
    stores: [
      {
        id: data.storeId,
        name: data.organization.name,
        role: data.canManage ? "owner" : "member",
        organizationId: data.organization.id,
      },
    ],
  });
  const root = createRootRoute();
  const billing = createRoute({
    getParentRoute: () => root,
    path: "/billing/$organizationId",
    component: () => {
      const { organizationId } = billing.useParams();
      return <BillingPage key={organizationId} organizationId={organizationId} />;
    },
  });
  const router = createRouter({
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
  const { fetch } = await show();
  await expect.element(page.getByRole("heading", { name: "契約と料金" })).toBeVisible();
  await expect.element(page.getByText("請求書はまだありません")).toBeVisible();
  await page.viewport(1366, 1100);
  await page.screenshot({
    path: "../../../test-results/tablecast-billing-overview.png",
    fullPage: false,
  });
  const filter = page.getByRole("searchbox", { name: "卓名・来店IDで絞り込み" });
  await userEvent.click(filter);
  await userEvent.type(filter, "T01");
  await expect.element(filter).toHaveFocus();
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
it("memberには契約・料金・請求書を表示せず、請求APIを呼ばない", async () => {
  const { fetch } = await show({
    ...billingFixture,
    canManage: false,
    financial: null,
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
  expect(document.body.textContent).not.toContain("AI利用料金見込み");
  expect(document.body.textContent).not.toContain("契約と料金");
  expect(
    fetch.mock.calls.some(([input, init]) => new Request(input, init).url.endsWith("/invoices")),
  ).toBe(false);
});
it("取得失敗から再試行し、狭い英語画面と文字拡大でも操作できる", async () => {
  await show(
    { ...billingFixture, usage: { ...billingFixture.usage, aiState: "failed" } },
    "en",
    true,
  );
  await page.viewport(390, 844);
  document.documentElement.style.fontSize = "20px";
  await userEvent.click(page.getByRole("button", { name: "Try again" }));
  await expect.element(page.getByText("AI preparation failed")).toBeVisible();
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  await page.screenshot({
    path: "../../../test-results/tablecast-billing-narrow-en.png",
    fullPage: true,
  });
});
it("組織切替で期間・検索・ページを初期化し、旧組織の遅い応答を表示しない", async () => {
  const { fetch, router } = await show();
  await expect.element(page.getByRole("heading", { name: "利用明細" })).toBeVisible();
  const oldResponse = Promise.withResolvers<Response>();
  fetch.mockImplementationOnce(() => oldResponse.promise);
  await userEvent.fill(
    page.getByRole("searchbox", { name: "卓名・来店IDで絞り込み" }),
    "old-table",
  );
  fetch.mockImplementation(async () =>
    Response.json({
      ...billingFixture,
      organization: { id: "tablecast-new-org", name: "新組織" },
      visits: [],
      financial: null,
    }),
  );
  await router.navigate({
    to: "/billing/$organizationId",
    params: { organizationId: "tablecast-new-org" },
  });
  await expect.element(page.getByRole("searchbox")).toHaveValue("");
  oldResponse.resolve(
    Response.json({
      ...billingFixture,
      organization: { id: "tablecast-billing-org", name: "古い応答" },
    }),
  );
  await expect.element(page.getByText("この期間のAI利用はありません")).toBeVisible();
  expect(document.body.textContent).not.toContain("古い応答");
});
