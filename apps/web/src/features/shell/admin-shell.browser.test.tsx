import { detectPlatform } from "@tanstack/react-hotkeys";
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
import { useState } from "react";
import { LocaleProvider } from "../../i18n/locale";
import { MotionProvider } from "../../components/motion-provider";
import { PanelLayoutProvider } from "../../lib/panel-layout";
import { AdminShell } from "./admin-shell";
import { StorePicker } from "./admin-sidebar";
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
      if (name?.startsWith("tablecast-layout-") || name === "tablecast-navigation")
        document.cookie = `${name}=; Path=/; Max-Age=0`;
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

async function show(locale: "ja" | "en" = "ja", initial = "/account", signedIn = false) {
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
  client.setQueryData(
    ["tablecast-session"],
    signedIn
      ? {
          user: {
            id: "tablecast-user",
            name: "店舗スタッフ",
            email: "restaurant.staff@example.com",
            image: null,
          },
        }
      : null,
  );
  const stores: Parameters<typeof StorePicker>[0]["stores"] = [
    {
      id: "tablecast-shell",
      name: "試験店舗",
      logo: null,
      role: "owner",
      organizationId: "tablecast-org",
    },
    {
      id: "tablecast-shell-second",
      name: "二号店舗",
      logo: null,
      role: "owner",
      organizationId: "tablecast-org-second",
    },
  ];
  client.setQueryData(["tablecast-stores"], { stores });
  const root = createRootRoute({
    component: function ShellPage() {
      const [selectedStore, setSelectedStore] = useState("tablecast-shell");
      return (
        <AdminShell
          tab={initial === "/account" ? "account" : "live"}
          storeId={selectedStore}
          storeName={stores.find((store) => store.id === selectedStore)?.name}
          renderStorePicker={({ collapsed, onNavigate }) => (
            <StorePicker
              stores={stores}
              selectedStore={selectedStore}
              pending={false}
              collapsed={collapsed}
              onChange={(id) => {
                setSelectedStore(id);
                onNavigate?.();
              }}
            />
          )}
        >
          <Outlet />
        </AdminShell>
      );
    },
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

const width = () => sidebar()?.getBoundingClientRect().width ?? 0;

it("サイドバーの幅をCookieへ保存し、再表示と折りたたみでも復元する", async () => {
  await page.viewport(1180, 820);
  const view = await show();
  const handle = page.getByRole("separator", { name: ja.admin_resize_sidebar, exact: true });
  await expect.element(handle).toBeEnabled();
  const initial = width();
  handle.element().focus();
  await userEvent.keyboard("{ArrowRight}");
  await expect.poll(width).toBeGreaterThan(initial);
  const adjusted = width();
  expect(document.cookie).toContain("tablecast-layout-");
  const toggle = page.getByRole("button", { name: ja.admin_navigation, exact: true });
  let widthTransition = false;
  sidebar()?.addEventListener("transitionrun", (event) => {
    if (event.propertyName === "flex-grow" && event.target === sidebar()) widthTransition = true;
  });
  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
  // 幅の終端を測り、描画中のflex-growを保存幅と取り違えない。
  await Promise.allSettled(
    sidebar()
      ?.getAnimations()
      .map((animation) => animation.finished) ?? [],
  );
  await expect.poll(width).toBeLessThan(80);
  expect(widthTransition).toBe(!matchMedia("(prefers-reduced-motion: reduce)").matches);
  await toggle.click();
  await expect.poll(() => Math.abs(width() - adjusted)).toBeLessThan(2);
  await view.unmount();
  client.clear();
  await show();
  await expect.poll(() => Math.abs(width() - adjusted)).toBeLessThan(2);
});

it("子ページの現在地を直接開き、モバイルの子リンクへ移るとナビゲーションを閉じる", async () => {
  await page.viewport(402, 874);
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

it("店舗選択をサイドバーに一つだけ表示し、折りたたみと画面幅の変更でも入力を保持する", async () => {
  await page.viewport(1180, 820);
  await show();
  const name = page.getByLabelText("表示名");
  const input = name.element();
  await name.fill("編集中の名前");
  const picker = page.getByRole("combobox", { name: ja.stores_title, exact: true });
  await expect.element(picker).toBeVisible();
  expect(picker.elements()).toHaveLength(1);
  await expect
    .element(page.getByRole("main").getByRole("combobox", { name: ja.stores_title, exact: true }))
    .not.toBeInTheDocument();
  picker.element().focus();
  await userEvent.keyboard("{ArrowDown}");
  const choices = page.getByRole("listbox");
  await expect.element(choices).toBeVisible();
  await expect.element(choices.getByRole("option", { name: /試験店舗$/ })).toHaveFocus();
  await userEvent.keyboard("{End}");
  await expect.element(choices.getByRole("option", { name: /二号店舗$/ })).toHaveFocus();
  await userEvent.keyboard("{Enter}");
  await expect.element(picker).toMatchTextContent("二号店舗");

  const toggle = page.getByRole("button", { name: ja.admin_navigation, exact: true });
  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-expanded", "false");
  await expect.element(picker).toBeVisible();
  expect(picker.elements()).toHaveLength(1);
  await expect.element(page.getByRole("main").getByText("二号店舗", { exact: true })).toBeVisible();
  await expect.element(name).toHaveValue("編集中の名前");
  expect(name.element()).toBe(input);
  // 完了を待たずに反転しても、入力と保存した展開幅を維持する。
  await toggle.click();
  await toggle.click();
  await toggle.click();
  await expect.element(toggle).toHaveAttribute("aria-expanded", "true");
  expect(name.element()).toBe(input);

  await page.viewport(402, 874);
  await expect.element(picker).not.toBeInTheDocument();
  await expect.element(page.getByRole("main").getByText("二号店舗", { exact: true })).toBeVisible();
  await toggle.click();
  const dialog = page.getByRole("dialog");
  await expect
    .element(dialog.getByRole("combobox", { name: ja.stores_title, exact: true }))
    .toBeVisible();
  expect(picker.elements()).toHaveLength(1);
  await page.getByRole("button", { name: ja.common_close, exact: true }).click();
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(toggle).toHaveFocus();
  await expect.element(name).toHaveValue("編集中の名前");
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(402);

  await toggle.click();
  await expect.element(dialog).toBeVisible();
  await page.viewport(1180, 820);
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(picker).toBeVisible();
  expect(picker.elements()).toHaveLength(1);
  await expect.element(picker).toMatchTextContent("二号店舗");
  await expect.element(name).toHaveValue("編集中の名前");

  await page.viewport(402, 874);
  await expect.element(dialog).not.toBeInTheDocument();
  await expect.element(picker).not.toBeInTheDocument();
  await expect.element(page.getByRole("main").getByText("二号店舗", { exact: true })).toBeVisible();
  await expect.element(name).toHaveValue("編集中の名前");
});

it("サイドバーのショートカットは編集入力を奪わず、通常ボタンと同じ状態を切り替える", async () => {
  await page.viewport(1180, 820);
  await show();
  const trigger = page.getByRole("button", { name: "ナビゲーション", exact: true });
  const shortcut = detectPlatform() === "mac" ? "{Meta>}b{/Meta}" : "{Control>}b{/Control}";
  await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
  const floor = page.getByRole("link", { name: ja.admin_live, exact: true });
  const floorElement = floor.element();
  floorElement.focus();
  await userEvent.keyboard(shortcut);
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  expect(floor.element()).toBe(floorElement);
  await expect.element(floor).toHaveFocus();
  // 幅の変更中に反転しても同じリンクにフォーカスを保つ。
  await userEvent.keyboard(shortcut);
  await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
  expect(floor.element()).toBe(floorElement);
  await expect.element(floor).toHaveFocus();
  await userEvent.keyboard(shortcut);
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  await expect.element(floor).toHaveFocus();
  await userEvent.click(page.getByRole("textbox", { name: "表示名" }));
  await userEvent.keyboard(shortcut);
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  await userEvent.click(trigger);
  await expect.element(trigger).toHaveAttribute("aria-expanded", "true");

  const menuGroup = page.getByRole("button", { name: ja.admin_config, exact: true });
  await menuGroup.click();
  await expect.element(menuGroup).toHaveAttribute("aria-expanded", "false");
  await userEvent.keyboard(shortcut);
  await expect.element(trigger).toHaveAttribute("aria-expanded", "false");
  const products = page.getByRole("link", { name: ja.editor_products, exact: true });
  const productElement = products.element();
  await expect.element(products).toHaveFocus();
  await userEvent.keyboard(shortcut);
  await expect.element(trigger).toHaveAttribute("aria-expanded", "true");
  await expect.element(menuGroup).toHaveFocus();
  await expect.element(menuGroup).toHaveAttribute("aria-expanded", "false");
  await menuGroup.click();
  expect(products.element()).toBe(productElement);
});

it("利用者メニューを開いてもトリガー・サイドバー・本文を動かさない", async () => {
  await page.viewport(1180, 820);
  await show("ja", "/account", true);
  const trigger = page.getByRole("button", { name: ja.account_title, exact: true });
  await expect.element(trigger).toMatchTextContent("restaurant.staff@example.com");
  const email = trigger.getByText("restaurant.staff@example.com").element();
  expect(getComputedStyle(email).whiteSpace).toBe("nowrap");
  expect(getComputedStyle(email).textOverflow).toBe("ellipsis");
  const main = page.getByRole("main");
  const before = [trigger.element(), main.element()].map((element) =>
    element.getBoundingClientRect(),
  );
  await trigger.click();
  await expect.element(page.getByRole("menu")).toBeVisible();
  const after = [trigger.element(), main.element()].map((element) =>
    element.getBoundingClientRect(),
  );

  for (let i = 0; i < before.length; i++)
    for (const key of ["x", "y", "width", "height"] as const)
      expect(after[i]?.[key]).toBeCloseTo(before[i]?.[key] ?? 0, 1);
  await userEvent.keyboard("{Escape}");
  await expect.element(trigger).toHaveFocus();
  await page.getByRole("button", { name: ja.admin_navigation, exact: true }).click();
  const link = page.getByRole("link", { name: ja.home_title, exact: true });
  await expect.element(link).toHaveAttribute("data-collapsed", "true");
  const icon = link.element().querySelector("svg");
  expect(icon).not.toBeNull();
  const linkRect = link.element().getBoundingClientRect();
  const iconRect = icon?.getBoundingClientRect();
  expect((iconRect?.left ?? 0) - linkRect.left).toBeCloseTo(
    linkRect.right - (iconRect?.right ?? 0),
    1,
  );
  await userEvent.hover(link);
  await expect.element(page.getByText(ja.home_title, { exact: true })).toBeVisible();
  await userEvent.unhover(link);
  await expect.element(page.getByText(ja.home_title, { exact: true })).not.toBeInTheDocument();
  await userEvent.keyboard("{Tab}");
  link.element().focus();
  await expect.element(link).toHaveFocus();
  await expect.element(page.getByText(ja.home_title, { exact: true })).toBeVisible();
  const accountRect = trigger.element().getBoundingClientRect();
  const accountIconRect = trigger.element().querySelector("svg")?.getBoundingClientRect();
  expect((accountIconRect?.left ?? 0) - accountRect.left).toBeCloseTo(
    accountRect.right - (accountIconRect?.right ?? 0),
    1,
  );
});
