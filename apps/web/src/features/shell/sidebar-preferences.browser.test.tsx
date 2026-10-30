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
import { page } from "vitest/browser";
import { z } from "zod";
import { LocaleProvider } from "../../i18n/locale";
import { PanelLayoutProvider } from "../../lib/panel-layout";
import "../../styles.css";
import { IntegrationSetup } from "../account/integration-setup";
import { StoreAdminShell } from "../store/admin-shell";

const stores = [
  {
    id: "tablecast-nav-first",
    organizationId: "tablecast-nav-org-first",
    name: "本店",
    role: "owner",
    logo: null,
  },
  {
    id: "tablecast-nav-second",
    organizationId: "tablecast-nav-org-second",
    name: "二号店",
    role: "admin",
    logo: null,
  },
];
const session = {
  user: { id: "tablecast-navigation-user", email: "owner@example.com", name: "店長", image: null },
  session: { activeOrganizationId: "tablecast-nav-org-first" },
};
let client: QueryClient;
let mutations: string[] = [];
afterEach(async () => {
  await cleanup();
  client?.clear();
  vi.unstubAllGlobals();
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0];
    if (name?.startsWith("tablecast-layout-") || name === "tablecast-navigation")
      document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
});
async function show(initial = "/admin/stores/tablecast-nav-first/floor", userId = session.user.id) {
  await page.viewport(1512, 982);
  mutations = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init),
      path = new URL(request.url).pathname;
    if (path === "/api/auth/organization/set-active") {
      const body = z.object({ organizationId: z.string() }).parse(await request.json());
      mutations.push(body.organizationId);
      return Response.json({ id: body.organizationId });
    }
    if (path === "/api/auth/organization/get-full-organization") return Response.json(null);
    throw new Error(`未定義の要求: ${path}`);
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["tablecast-session"], { ...session, user: { ...session.user, id: userId } });
  client.setQueryData(["tablecast-stores"], { stores });
  const root = createRootRoute();
  const floor = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/floor",
    component: () => (
      <StoreAdminShell tab="live" storeId={floor.useParams().storeId}>
        <h1>フロア</h1>
      </StoreAdminShell>
    ),
  });
  const home = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
    component: () => (
      <StoreAdminShell tab="live" storeId={home.useParams().storeId}>
        <h1>店舗ホーム</h1>
      </StoreAdminShell>
    ),
  });
  const manual = createRoute({
    getParentRoute: () => root,
    path: "/account/integrations/manual",
    component: () => (
      <StoreAdminShell tab="mcp">
        <h1>接続の手順</h1>
      </StoreAdminShell>
    ),
  });
  const plugin = createRoute({
    getParentRoute: () => root,
    path: "/account/integrations/plugins",
    component: () => <IntegrationSetup mode="plugins" />,
  });
  const router = createRouter({
    routeTree: root.addChildren([floor, home, manual, plugin]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  await router.load();
  const view = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <PanelLayoutProvider cookies={document.cookie}>
          <RouterProvider router={router} />
        </PanelLayoutProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { router, view };
}
const group = (name: string) => page.getByRole("button", { name, exact: true });
const picker = () => page.getByRole("combobox", { name: "店舗", exact: true });
const floorLink = () => page.getByRole("link", { name: "フロアの様子", exact: true });
it("MCPとSkillsへ移っても選択店舗とグループの展開を保ち、再表示と折りたたみから復元する", async () => {
  const { view } = await show();
  for (const label of ["営業", "メニュー・接客", "会員施策", "店舗管理", "連携・店舗一覧"])
    await expect.element(group(label)).toHaveAttribute("aria-expanded", "true");
  await group("会員施策").click();
  await page.getByRole("link", { name: "手動導入", exact: true }).click();
  await expect.element(page.getByRole("heading", { name: "接続の手順" })).toBeVisible();
  await expect.element(picker()).toMatchTextContent("本店");
  await expect.element(group("メニュー・接客")).toHaveAttribute("aria-expanded", "true");
  await expect.element(group("会員施策")).toHaveAttribute("aria-expanded", "false");
  await expect.element(group("ドキュメント")).not.toBeInTheDocument();
  const docs = page.getByRole("link", { name: "ドキュメント", exact: true });
  await expect.element(docs).toHaveAttribute("href", "/help/ja");
  await expect.element(docs).toHaveAttribute("target", "_blank");
  await expect.element(docs).toHaveAttribute("rel", "noopener");
  await page.getByRole("link", { name: "プラグイン導入", exact: true }).click();
  await expect.element(page.getByRole("heading", { name: "Marketplace · Codex" })).toBeVisible();
  await expect
    .element(floorLink())
    .toHaveAttribute("href", "/admin/stores/tablecast-nav-first/floor");
  await expect
    .element(page.getByRole("link", { name: "課金／請求", exact: true }))
    .toHaveAttribute("href", "/billing/tablecast-nav-org-first");
  expect(mutations).toEqual([]);
  await group("ナビゲーション").click();
  await expect.element(group("ナビゲーション")).toHaveAttribute("aria-expanded", "false");
  await expect.element(docs).toBeVisible();
  await expect.element(docs).toHaveAttribute("data-collapsed", "true");
  await view.unmount();
  client.clear();
  await show("/account/integrations/plugins");
  await expect.element(group("ナビゲーション")).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(
      () =>
        document.getElementById("tablecast-admin-sidebar")?.getBoundingClientRect().width ?? 1000,
    )
    .toBeLessThan(80);
  await group("ナビゲーション").click();
  await expect.element(group("メニュー・接客")).toHaveAttribute("aria-expanded", "true");
  await expect.element(group("会員施策")).toHaveAttribute("aria-expanded", "false");
  await expect.element(picker()).toMatchTextContent("本店");
});
it("連携画面から店舗を切り替え、組織・請求リンク・次回の選択を更新する", async () => {
  const { view, router } = await show("/account/integrations/plugins");
  await picker().click();
  await page.getByRole("option", { name: /二号店$/ }).click();
  await expect
    .poll(() => router.state.location.pathname)
    .toBe("/admin/stores/tablecast-nav-second");
  expect(mutations).toEqual(["tablecast-nav-org-second"]);
  expect(client.getQueryData(["tablecast-session"])).toMatchObject({
    session: { activeOrganizationId: "tablecast-nav-org-second" },
  });
  await page.getByRole("link", { name: "手動導入", exact: true }).click();
  await expect.element(picker()).toMatchTextContent("二号店");
  await expect
    .element(page.getByRole("link", { name: "課金／請求", exact: true }))
    .toHaveAttribute("href", "/billing/tablecast-nav-org-second");
  await view.unmount();
  client.clear();
  await show("/account/integrations/manual");
  await expect.element(picker()).toMatchTextContent("二号店");
});
it("別の利用者や削除済み店舗の保存値を選択店舗として使わない", async () => {
  const saved = {
    userId: session.user.id,
    storeId: "tablecast-nav-second",
    groups: { operations: false },
  };
  document.cookie = `tablecast-navigation=${encodeURIComponent(JSON.stringify(saved))}; Path=/`;
  const { view } = await show("/account/integrations/manual", "tablecast-other-user");
  await expect.element(picker()).toMatchTextContent("本店");
  await expect.element(group("営業")).toHaveAttribute("aria-expanded", "true");
  await view.unmount();
  client.clear();
  document.cookie = `tablecast-navigation=${encodeURIComponent(JSON.stringify({ ...saved, storeId: "tablecast-removed" }))}; Path=/`;
  await show("/account/integrations/manual");
  await expect.element(picker()).toMatchTextContent("本店");
});
