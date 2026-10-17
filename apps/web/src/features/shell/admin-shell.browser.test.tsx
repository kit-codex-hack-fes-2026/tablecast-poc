import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocaleProvider } from "../../i18n/locale";
import { MotionProvider } from "../../components/motion-provider";
import { PanelLayoutProvider } from "../../lib/panel-layout";
import { AdminShell } from "./admin-shell";
import ja from "../../../messages/ja.json";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import "../../styles.css";

let client: QueryClient;
let unexpected: string[] = [];
const sidebar = () => document.getElementById("tablecast-admin-sidebar");
let initialViewport: { width: number; height: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  try {
    await cleanup();
    client.clear();
    vi.unstubAllGlobals();
    for (const cookie of document.cookie.split(";")) {
      const name = cookie.trim().split("=")[0];
      if (name?.startsWith("tablecast-layout-")) document.cookie = `${name}=; Path=/; Max-Age=0`;
    }
    document.documentElement.style.fontSize = "";
    if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

async function show(locale: "ja" | "en" = "ja", initial = "/account") {
  unexpected = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === "/api/auth/organization/get-full-organization") return Response.json(null);
    if (path === "/api/admin/stores/tablecast-shell/catalog")
      return Response.json({ ...catalog, storeId: "tablecast-shell" });
    unexpected.push(request.url);
    return Response.json({}, { status: 500 });
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["tablecast-session"], null);
  client.setQueryData(["tablecast-stores"], {
    stores: [
      {
        id: "tablecast-shell",
        name: "試験店舗",
        logo: null,
        role: "owner",
        organizationId: "tablecast-org",
      },
    ],
  });
  const root = createRootRoute({
    component: () => (
      <AdminShell tab={initial === "/account" ? "account" : "live"} storeId="tablecast-shell">
        <Outlet />
      </AdminShell>
    ),
  });
  const account = createRoute({
    getParentRoute: () => root,
    path: "/account",
    component: () => (
      <>
        <h1>試験画面</h1>
        <label className="flex min-w-0 flex-col">
          表示名
          <input className="w-full min-w-0" />
        </label>
      </>
    ),
  });
  const menu = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/menu/$section",
    component: () => <h1>メニューのページ</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([account, menu]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  await router.load();
  return render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <PanelLayoutProvider cookies={document.cookie}>
            <RouterProvider router={router} />
          </PanelLayoutProvider>
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
}

it("サイドバーの幅をCookieへ保存し、再表示と折りたたみでも復元する", async () => {
  await page.viewport(1024, 768);
  const view = await show();
  const handle = page.getByRole("separator", { name: ja.admin_resize_sidebar, exact: true });
  await expect.element(handle).toBeEnabled();
  const width = () => sidebar()?.getBoundingClientRect().width ?? 0;
  const initial = width();
  handle.element().focus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.poll(width).toBeGreaterThan(initial);
  const adjusted = width();
  expect(document.cookie).toContain("tablecast-layout-");
  const toggle = page.getByRole("button", { name: ja.admin_navigation, exact: true });
  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
  await expect.poll(width).toBeLessThan(80);
  await toggle.click();
  await expect.poll(() => Math.abs(width() - adjusted)).toBeLessThan(2);
  await view.unmount();
  client.clear();
  await show();
  await expect.poll(() => Math.abs(width() - adjusted)).toBeLessThan(2);
});

it("子ページの現在地を直接開き、モバイルの子リンクへ移るとナビゲーションを閉じる", async () => {
  await page.viewport(390, 844);
  await show("ja", "/admin/stores/tablecast-shell/menu/categories");
  const toggle = page.getByRole("button", { name: ja.admin_navigation, exact: true });
  await toggle.click();
  const dialog = page.getByRole("dialog");
  const categories = dialog.getByRole("link", { name: ja.editor_categories, exact: true });
  await expect.element(categories).toHaveAttribute("aria-current", "page");
  await dialog.getByRole("link", { name: ja.editor_products, exact: true }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  await toggle.click();
  await expect
    .element(dialog.getByRole("link", { name: ja.editor_products, exact: true }))
    .toHaveAttribute("aria-current", "page");
});

it("日本語を200%にしても狭い画面のナビゲーションと入力を操作できる", async () => {
  const locale = "ja";
  const labels = ja;
  await page.viewport(390, 844);
  await show(locale);
  for (const element of document.querySelectorAll<HTMLElement>("body *")) {
    if (
      [...element.childNodes].some(
        (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
      )
    ) {
      element.style.fontSize = `${Number.parseFloat(getComputedStyle(element).fontSize) * 2}px`;
    }
  }
  const name = page.getByLabelText("表示名");
  await name.fill("編集中の名前");
  const toggle = page.getByRole("button", { name: labels.admin_navigation, exact: true });
  await toggle.click();
  const dialog = page.getByRole("dialog");
  await expect.element(dialog).toBeVisible();
  await page.getByRole("button", { name: labels.common_close, exact: true }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(toggle).toHaveFocus();
  await expect.element(name).toHaveValue("編集中の名前");
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(390);
});
