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
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { CreateStore } from "./create-store";

// 認証済みの枠だけを省略し、フォーム・hc・Query・Routerは実物を使う。
vi.mock("../store/settings-shell", () => ({
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

it("日本語で入力の上限とAPIの項目エラーを案内し、修正後に再送できる", async () => {
  const locale = "ja";
  const labels = ja;
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
  await expect.element(page.getByRole("alert")).toMatchTextContent("100");
  await expect.element(page.getByRole("spinbutton")).toHaveAttribute("aria-invalid", "true");
  expect(requests).toHaveLength(0);
  // When: 修正して送ると、APIから店舗名の検証エラーを受ける。
  await page.getByRole("spinbutton").fill("10");
  await page.getByRole("button", { name: labels.stores_create }).click();
  // Then: エラーを店舗名に結び付け、他の入力を維持する。
  await expect
    .element(page.getByRole("textbox", { name: labels.org_name }))
    .toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByRole("alert")).toMatchTextContent("3文字以下");
  await expect
    .element(page.getByRole("textbox", { name: labels.org_slug }))
    .toHaveValue("tablecast-test");

  // When / Then: 対象の入力を修正すると項目エラーを解除し、再送できる。
  await page.getByRole("textbox", { name: labels.org_name }).fill("珈琲店");
  await expect
    .element(page.getByRole("textbox", { name: labels.org_name }))
    .not.toHaveAttribute("aria-invalid", "true");
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  await page.getByRole("button", { name: labels.stores_create }).click();
  await expect.element(page.getByRole("heading", { name: "作成完了" })).toBeVisible();
  expect(requests).toEqual([
    { name: "こもれび珈琲", slug: "tablecast-test", tableCount: 10 },
    { name: "珈琲店", slug: "tablecast-test", tableCount: 10 },
  ]);
});
