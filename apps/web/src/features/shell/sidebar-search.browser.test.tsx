import { detectPlatform } from "@tanstack/react-hotkeys";
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
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { SidebarSearch } from "./sidebar-search";
let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client?.clear();
  vi.unstubAllGlobals();
});
async function show(
  handler: (query: string) => Promise<Response>,
  collapsed = false,
  locale: "en" | "ja" = "ja",
) {
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
      window.location.origin,
    );
    if (url.pathname !== "/help/search" || url.searchParams.get("locale") !== locale)
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
        <button type="button" className="fixed right-4 bottom-4">
          検索外の操作
        </button>
      </div>
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([
      createRoute({ getParentRoute: () => root, path: "$", component: () => null }),
    ]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <RouterProvider router={router} />
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return router;
}
const input = () => page.getByRole("searchbox", { name: "ページとDocsを検索" });
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
        .getByText("Docsを検索できませんでした。入力を保ったまま再試行できます。", {
          exact: true,
        }),
    )
    .toBeVisible();
  await expect.element(input()).toHaveValue("商品");
  failed = false;
  const retry = page.getByRole("button", { name: "再試行", exact: true });
  retry.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(page.getByRole("link", { name: "設定と公開 商品の価格と説明を確認する" }))
    .toBeVisible();
  await input().fill("tablecast-no-matches");
  await expect
    .element(page.getByText("一致するDocsはありません。別の言葉で検索してください。"))
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
  await input().fill("tablecast-keyboard-search");
  await expect.element(page.getByRole("dialog", { name: "検索結果" })).toBeVisible();
});
it("折りたたんだサイドバーから検索を開き、入力と数字キーで結果を開ける", async () => {
  const router = await show(
    async (query) => Response.json(query === "商品" ? candidates() : []),
    true,
  );
  await page.getByRole("button", { name: "ページとDocsを検索", exact: true }).click();
  await expect.element(input()).toHaveFocus();
  await input().fill("statistics");
  await expect.element(page.getByText("一致するページはありません。")).toBeVisible();
  await input().fill("商品");
  await expect.element(page.getByRole("link", { name: "商品ガイド3 商品の案内3" })).toBeVisible();
  const modifier = detectPlatform() === "mac" ? "Meta" : "Control";
  await userEvent.keyboard(`{${modifier}>}2{/${modifier}}`);
  await expect.poll(() => router.state.location.pathname).toBe("/help/ja/first");
});

function candidates() {
  return ["first", "second", "third"].flatMap((name, index) => [
    {
      id: `tablecast-${name}-page`,
      type: "page",
      content: `商品ガイド${index + 1}`,
      url: `/help/ja/${name}`,
    },
    {
      id: `tablecast-${name}-text`,
      type: "text",
      content: `商品の案内${index + 1}`,
      url: `/help/ja/${name}#details`,
    },
  ]);
}
it("Enterは先頭、Cmd/Ctrlと数字は分類を通した表示順で開き、検索外では発火しない", async () => {
  const router = await show(async () => Response.json(candidates()));
  const modifier = detectPlatform() === "mac" ? "Meta" : "Control";
  const destinations = [
    "/admin/stores/tablecast-search-store/menu/products",
    "/help/ja/first",
    "/help/ja/second",
    "/help/ja/third",
  ];
  for (const [index, destination] of destinations.entries()) {
    await input().fill("商品");
    await expect.element(page.getByRole("link", { name: "商品ガイド3 商品の案内3" })).toBeVisible();
    await userEvent.keyboard(`{${modifier}>}${index + 1}{/${modifier}}`);
    await expect.poll(() => router.state.location.pathname).toBe(destination);
  }
  await input().fill("商品");
  await expect.element(page.getByRole("link", { name: "商品ガイド3 商品の案内3" })).toBeVisible();
  await page.getByRole("button", { name: "検索外の操作", exact: true }).click();
  await userEvent.keyboard(`{${modifier}>}1{/${modifier}}`);
  expect(router.state.location.pathname).toBe("/help/ja/third");
  await input().click();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => router.state.location.pathname).toBe(destinations[0]);
  await input().fill("商品");
  await expect.element(page.getByRole("link", { name: "商品ガイド3 商品の案内3" })).toBeVisible();
  const second = page.getByRole("link", { name: "商品ガイド1 商品の案内1" });
  second.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.poll(() => router.state.location.pathname).toBe("/help/ja/first");
});
it("IME変換中とSafariの変換確定Enterでは移動せず、変換後にだけ結果を開く", async () => {
  const router = await show(async () => Response.json(candidates()));
  await input().fill("商品");
  await expect.element(page.getByRole("link", { name: "商品ガイド3 商品の案内3" })).toBeVisible();
  const field = input().element();
  field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true, data: "しょ" }));
  await userEvent.keyboard("{Enter}");
  const modifier = detectPlatform() === "mac" ? "Meta" : "Control";
  await userEvent.keyboard(`{${modifier}>}2{/${modifier}}`);
  expect(router.state.location.pathname).toBe("/");
  field.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "商品" }));
  field.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      keyCode: 229,
      isComposing: false,
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(router.state.location.pathname).toBe("/");
  field.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      isComposing: true,
      bubbles: true,
      cancelable: true,
    }),
  );
  expect(router.state.location.pathname).toBe("/");
  await userEvent.keyboard("{Enter}");
  await expect
    .poll(() => router.state.location.pathname)
    .toBe("/admin/stores/tablecast-search-store/menu/products");
});
it("Markdownのcode・強調を描画し、英語の語形変化で一致した原文を強調する", async () => {
  await show(
    async () =>
      Response.json([
        {
          id: "tablecast-markdown-page",
          type: "page",
          content: "Membership",
          url: "/help/en/membership",
        },
        {
          id: "tablecast-markdown-text",
          type: "text",
          content:
            "A **customer** reads `get_configuration` and *checks* a [guide](https://example.com/).",
          url: "/help/en/membership#guide",
        },
        {
          id: "tablecast-markdown-table",
          type: "text",
          table: "customer-fields",
          content:
            "| Field | Meaning |\n| --- | --- |\n| `customer_id` | **Customer** identifier |",
          url: "/help/en/membership#fields",
        },
      ]),
    false,
    "en",
  );
  await page.getByRole("searchbox", { name: "Search pages and docs" }).fill("customers");
  const result = page.getByRole("link", {
    name: "Membership A customer reads get_configuration and checks a guide.",
  });
  await expect.element(result).toBeVisible();
  expect(result.element().querySelector("code")?.textContent).toBe("get_configuration");
  expect(result.element().querySelector("strong")?.textContent).toBe("customer");
  expect(result.element().querySelector("em")?.textContent).toBe("checks");
  expect(result.element().querySelector("a")).toBeNull();
  const table = page.getByRole("link", { name: /Membership Field.*Meaning.*customer_id/ });
  await expect.element(table).toBeVisible();
  expect(table.element().querySelector("code")?.textContent).toBe("customer_id");
  expect(table.element().textContent).not.toContain("|");
  await expect
    .poll(() =>
      [...(CSS.highlights.get("fd-search") ?? [])].map((range) => {
        const actual = document.createRange();
        actual.setStart(range.startContainer, range.startOffset);
        actual.setEnd(range.endContainer, range.endOffset);
        return actual.toString();
      }),
    )
    .toContain("customer");
});
it("遅い旧検索と0件の候補をEnterや数字で開かない", async () => {
  const pending = Promise.withResolvers<Response>();
  let started = false;
  const router = await show(async (query) => {
    if (query === "tablecast-slow") {
      started = true;
      return pending.promise;
    }
    return Response.json([]);
  });
  try {
    await input().fill("tablecast-slow");
    await expect.poll(() => started).toBe(true);
    await input().fill("tablecast-empty");
    const modifier = detectPlatform() === "mac" ? "Meta" : "Control";
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(`{${modifier}>}4{/${modifier}}`);
    expect(router.state.location.pathname).toBe("/");
    pending.resolve(Response.json(candidates()));
    await expect
      .element(page.getByText("一致するDocsはありません。別の言葉で検索してください。"))
      .toBeVisible();
    await expect
      .element(page.getByRole("link", { name: "商品ガイド1 商品の案内1" }))
      .not.toBeInTheDocument();
  } finally {
    pending.resolve(Response.json([]));
  }
});
