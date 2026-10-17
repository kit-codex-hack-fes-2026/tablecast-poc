import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import { LocaleProvider } from "../../i18n/locale";
import { Games } from "./games";
import "../../styles.css";

// 店舗認証の枠だけ省略し、公開画面・Query・HTTP client・iframeは実物を接続する。
vi.mock("./store-shell", () => ({ useStore: () => ({ id: "tablecast-store", role: "owner" }) }));
let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)(
  "$localeで検証・実iframeの準備完了・人の試遊確認後に公開し停止できる",
  async ({ locale, labels }) => {
    const manifest = {
      apiVersion: 1,
      name: { ja: "順番ゲーム", en: "Taking turns" },
      description: { ja: "二人で遊びます", en: "Play together" },
      rules: { ja: "交代します", en: "Take turns" },
      minPlayers: 2,
      maxPlayers: 4,
      capabilities: ["state"],
    };
    let ready = false;
    let previewed = false;
    let activeVersionId: string | null = null;
    let revision = 0;
    const writes: { path: string; value: unknown }[] = [];
    const api = "/api/admin/stores/tablecast-store/games";
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path === api) return Response.json({ games: [{ id: "tablecast-turns" }], next: null });
      if (path === `${api}/tablecast-turns`)
        return Response.json({
          activeVersionId,
          revision,
          versions: [
            {
              id: "tablecast-v1",
              manifest,
              status: ready ? "ready" : "draft",
              previewed,
              published: !!activeVersionId,
            },
          ],
          nextBefore: null,
        });
      if (path.endsWith("/preview"))
        return Response.json({
          versionId: "tablecast-v1",
          parentOrigin: window.location.origin,
          package: { manifest, html: "<p>試遊</p>", css: "", javascript: "void tablecast.ready;" },
        });
      if (request.method === "POST") {
        writes.push({
          path,
          value: request.headers.get("content-type")?.includes("application/json")
            ? await request.json()
            : null,
        });
        if (path.endsWith("/validate")) ready = true;
        else if (path.endsWith("/previewed")) previewed = true;
        else if (path.endsWith("/publish")) {
          activeVersionId = "tablecast-v1";
          revision++;
        } else if (path.endsWith("/disable")) {
          activeVersionId = null;
          revision++;
        } else throw new Error(`未定義の要求: ${path}`);
        return Response.json({ saved: true });
      }
      throw new Error(`未定義の要求: ${path}`);
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const root = createRootRoute({
      component: () => (
        <Suspense fallback={<p>読込中</p>}>
          <Games />
        </Suspense>
      ),
    });
    const router = createRouter({
      routeTree: root,
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    await render(
      <QueryClientProvider client={client}>
        <LocaleProvider initialLocale={locale} persist={false}>
          <RouterProvider router={router} />
        </LocaleProvider>
      </QueryClientProvider>,
    );
    await page.getByRole("button", { name: "tablecast-turns", exact: true }).click();
    await expect
      .element(page.getByRole("button", { name: labels.games_preview, exact: true }))
      .toBeDisabled();
    await expect
      .element(page.getByRole("button", { name: labels.games_publish, exact: true }))
      .toBeDisabled();
    await page.getByRole("button", { name: labels.admin_validate, exact: true }).click();
    await expect
      .element(page.getByRole("button", { name: labels.games_preview, exact: true }))
      .toBeEnabled();
    await page.getByRole("button", { name: labels.games_preview, exact: true }).click();
    await expect.element(page.getByTitle(manifest.name[locale])).toBeVisible();
    await expect
      .element(page.getByRole("button", { name: labels.games_preview, exact: true }))
      .toBeDisabled();
    await page.getByRole("button", { name: labels.games_preview_confirm, exact: true }).click();
    await expect.element(page.getByTitle(manifest.name[locale])).not.toBeInTheDocument();
    await page.getByRole("button", { name: labels.games_publish, exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: labels.games_publish, exact: true })
      .click();
    await expect
      .element(page.getByRole("button", { name: labels.games_disable, exact: true }))
      .toBeVisible();
    expect(writes.find(({ path }) => path.endsWith("/publish"))?.value).toEqual({
      versionId: "tablecast-v1",
      expectedRevision: 0,
      approved: true,
    });
    await page.getByRole("button", { name: labels.games_disable, exact: true }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: labels.games_disable, exact: true })
      .click();
    await expect
      .element(page.getByRole("button", { name: labels.games_disable, exact: true }))
      .not.toBeInTheDocument();
    expect(writes.find(({ path }) => path.endsWith("/disable"))?.value).toEqual({
      expectedRevision: 1,
    });
  },
);
