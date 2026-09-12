import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { LocaleProvider, useI18n } from "../../i18n/locale";
import { CreateStore } from "./create-store";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import "../../styles.css";

// 認証済みの枠だけを省略し、フォーム・hc・Query・Routerは実物を使う。
vi.mock("../shell/settings-shell", () => ({
  SettingsShell: ({ children }: { children: ReactNode }) => (
    <main className="max-w-2xl space-y-5 p-8">{children}</main>
  ),
}));
let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

function LanguageSwitch() {
  const { locale, setLocale } = useI18n();
  return (
    <button type="button" onClick={() => setLocale(locale === "ja" ? "en" : "ja")}>
      日本語 / English
    </button>
  );
}

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)(
  "$localeで入力の上限とAPIの項目エラーを案内し、修正後に再送できる",
  async ({ locale, labels }) => {
    // Given: 店舗作成の実フォームと、1回目だけ項目検証で拒否するHTTP境界。
    const requests: unknown[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (request.method !== "POST" || new URL(request.url).pathname !== "/api/admin/stores")
        throw new Error(`未定義の要求: ${request.url}`);
      requests.push(await request.json());
      return requests.length === 1
        ? Response.json(
            {
              error: {
                code: "INVALID_INPUT",
                details: [
                  {
                    path: ["name"],
                    code: "too_big",
                    messages: {
                      ja: "大きすぎる値です: stringは3文字以下である必要があります",
                      en: "Too big: expected string to have <=3 characters",
                    },
                  },
                ],
              },
            },
            { status: 422 },
          )
        : Response.json({ id: "tablecast-created" }, { status: 201 });
    });
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const root = createRootRoute();
    const route = createRoute({ getParentRoute: () => root, path: "/", component: CreateStore });
    const created = createRoute({
      getParentRoute: () => root,
      path: "/admin/stores/$storeId/menu/$section",
      component: () => <h1>作成完了</h1>,
    });
    const router = createRouter({
      routeTree: root.addChildren([route, created]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await render(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale={locale} persist={false}>
          <LanguageSwitch />
          <RouterProvider router={router} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await page.getByRole("textbox", { name: labels.org_name }).fill("こもれび珈琲");
    await page.getByRole("textbox", { name: labels.org_slug }).fill("tablecast-test");
    // When: 卓数の上限を超える。
    await page.getByRole("spinbutton", { name: labels.stores_table_count }).fill("101");
    await page.getByRole("button", { name: labels.stores_create }).click();
    // Then: 失敗項目に上限を表示し、APIを呼ばない。
    await expect.element(page.getByRole("alert")).toHaveTextContent("100");
    await expect.element(page.getByRole("spinbutton")).toHaveAttribute("aria-invalid", "true");
    expect(requests).toHaveLength(0);
    await page.getByRole("button", { name: "日本語 / English" }).click();
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent(locale === "ja" ? "Too big" : "大きすぎる値");
    await page.getByRole("button", { name: "日本語 / English" }).click();
    await page.screenshot({
      path: `../../../test-results/browser/tablecast-zod-local-${locale}.png`,
    });
    // When: 修正して送ると、APIから店舗名の検証エラーを受ける。
    await page.getByRole("spinbutton").fill("10");
    await page.getByRole("button", { name: labels.stores_create }).click();
    // Then: エラーを店舗名に結び付け、他の入力を維持する。
    await expect
      .element(page.getByRole("textbox", { name: labels.org_name }))
      .toHaveAttribute("aria-invalid", "true");
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent(locale === "ja" ? "3文字以下" : "<=3 characters");
    await expect
      .element(page.getByRole("textbox", { name: labels.org_slug }))
      .toHaveValue("tablecast-test");
    await page.screenshot({
      path: `../../../test-results/browser/tablecast-zod-server-${locale}.png`,
    });
    // When / Then: 言語を切り替えても対象と入力を保ち、修正後は再送できる。
    await page.getByRole("button", { name: "日本語 / English" }).click();
    const next = locale === "ja" ? en : ja;
    await expect
      .element(page.getByRole("alert"))
      .toHaveTextContent(locale === "ja" ? "<=3 characters" : "3文字以下");
    await page.getByRole("textbox", { name: next.org_name }).fill("珈琲店");
    await expect
      .element(page.getByRole("textbox", { name: next.org_name }))
      .not.toHaveAttribute("aria-invalid", "true");
    await page.getByRole("button", { name: "日本語 / English" }).click();
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    await page.getByRole("button", { name: labels.stores_create }).click();
    await expect.element(page.getByRole("heading", { name: "作成完了" })).toBeVisible();
    expect(requests).toEqual([
      { name: "こもれび珈琲", slug: "tablecast-test", tableCount: 10 },
      { name: "珈琲店", slug: "tablecast-test", tableCount: 10 },
    ]);
  },
);
