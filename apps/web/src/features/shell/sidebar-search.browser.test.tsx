import { detectPlatform } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { SidebarSearch } from "./sidebar-search";
let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client?.clear();
  vi.unstubAllGlobals();
});
async function show(handler: (query: string) => Promise<Response>, collapsed = false) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
      window.location.origin,
    );
    if (url.pathname !== "/help/search" || url.searchParams.get("locale") !== "ja")
      throw new Error(`未定義の要求: ${url.pathname}`);
    return handler(url.searchParams.get("query") ?? "");
  });
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const root = createRootRoute({
    component: () => (
      <div className="w-64 p-4">
        <SidebarSearch
          collapsed={collapsed}
          selectedStore="tablecast-search-store"
          manager={false}
        />
      </div>
    ),
  });
  const router = createRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
}
const input = () => page.getByRole("searchbox", { name: "ページとヘルプを検索" });
it("入力を保って失敗を再試行でき、アプリ候補・0件・本文候補を区別する", async () => {
  let failed = true;
  await show(async (query) => {
    if (query === "商品" && failed) return new Response("検索を利用できません", { status: 503 });
    if (query !== "商品") return Response.json([]);
    return Response.json([
      {
        id: "tablecast-search-page",
        type: "page",
        content: "設定と公開",
        url: "/help/ja/configuration",
      },
      {
        id: "tablecast-search-text",
        type: "text",
        content: "商品の価格と説明を確認する",
        url: "/help/ja/configuration#draft",
      },
    ]);
  });
  await input().fill("商品");
  await expect
    .element(page.getByRole("link", { name: "商品 メニュー・接客" }))
    .toHaveAttribute("href", "/admin/stores/tablecast-search-store/menu/products");
  await expect
    .element(
      page
        .getByRole("alert")
        .getByText("ヘルプを検索できませんでした。入力を保ったまま再試行できます。", {
          exact: true,
        }),
    )
    .toBeVisible();
  await expect.element(input()).toHaveValue("商品");
  failed = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect
    .element(page.getByRole("link", { name: "設定と公開 商品の価格と説明を確認する" }))
    .toBeVisible();
  await input().fill("tablecast-no-matches");
  await expect
    .element(page.getByText("一致するヘルプはありません。別の言葉で検索してください。"))
    .toBeVisible();
  await expect
    .element(page.getByRole("link", { name: "設定と公開 商品の価格と説明を確認する" }))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "検索をクリア" }).click();
  await expect.element(input()).toHaveValue("");
  await expect.element(input()).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("dialog", { name: "検索結果" })).not.toBeInTheDocument();
  const shortcut = detectPlatform() === "mac" ? "{Meta>}k{/Meta}" : "{Control>}k{/Control}";
  await userEvent.keyboard(shortcut);
  await expect.element(input()).toHaveFocus();
  await expect.element(page.getByRole("dialog", { name: "検索結果" })).toBeVisible();
});
it("折りたたんだサイドバーから検索を開いて入力へフォーカスできる", async () => {
  await show(async () => Response.json([]), true);
  await page.getByRole("button", { name: "ページとヘルプを検索", exact: true }).click();
  await expect.element(input()).toHaveFocus();
  await input().fill("statistics");
  await expect.element(page.getByText("一致するページはありません。")).toBeVisible();
});
