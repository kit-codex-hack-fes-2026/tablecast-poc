import { resolveLocalized } from "@tablecast/api/localization";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Suspense } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { Games } from "./games";

// 店舗認証の枠だけ省略し、公開画面・Query・HTTP client・iframeは実物を接続する。
vi.mock("../store/store-context", () => ({
  useStore: () => ({ id: "tablecast-store", role: "owner" }),
}));
let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
});

async function openGame({ initialFailure = false, initialReady = false } = {}) {
  const locale = "ja";
  const manifest = {
    apiVersion: 1,
    name: { ja: "順番ゲーム", en: "Taking turns" },
    description: { ja: "二人で遊びます", en: "Play together" },
    rules: { ja: "交代します", en: "Take turns" },
    minPlayers: 2,
    maxPlayers: 4,
    capabilities: ["state"],
  };
  let previewRequests = 0;
  let ready = initialReady;
  let previewed = false;
  let activeVersionId: null | string = null;
  let revision = 0;
  const writes: { path: string; value: unknown }[] = [];
  const api = "/api/admin/stores/tablecast-store/games";
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    if (path === api)
      return Response.json({ games: [{ id: "tablecast-turns", name: manifest.name }], next: null });
    if (path === `${api}/tablecast-turns`)
      return Response.json({
        activeVersionId,
        revision,
        versions: [
          {
            id: "tablecast-v1",
            manifest,
            createdAt: Date.UTC(2026, 9, 20),
            status: ready ? "ready" : "draft",
            previewed,
            published: !!activeVersionId,
          },
        ],
        nextBefore: null,
      });
    if (path.endsWith("/preview")) {
      previewRequests++;
      if (initialFailure && previewRequests === 1)
        return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
      return Response.json({
        versionId: "tablecast-v1",
        parentOrigin: window.location.origin,
        package: { manifest, html: "<p>試遊</p>", css: "", javascript: "void tablecast.ready;" },
      });
    }
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
        <main className="p-6">
          <Games />
        </main>
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
  await page.getByRole("button", { name: "順番ゲーム", exact: true }).click();
  return {
    manifest,
    writes,
    get previewRequests() {
      return previewRequests;
    },
  };
}
it("日本語で検証・実iframeの準備完了・人の試遊確認後に公開し停止できる", async () => {
  const fixture = await openGame();
  const { manifest, writes } = fixture;
  const locale = "ja";
  const labels = ja;
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
  await expect.element(page.getByTitle(resolveLocalized(manifest.name, locale))).toBeVisible();
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  await expect
    .element(page.getByRole("button", { name: labels.games_preview_confirm, exact: true }))
    .toBeEnabled();
  expect(fixture.previewRequests).toBe(1);
  await expect
    .element(page.getByRole("button", { name: labels.games_preview, exact: true }))
    .toBeDisabled();
  await page.getByRole("button", { name: labels.games_preview_confirm, exact: true }).click();
  await expect
    .element(page.getByTitle(resolveLocalized(manifest.name, locale)))
    .not.toBeInTheDocument();
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
});

it("1版だけの試遊取得が503でも同じ画面で再試行し、iframe準備と人の確認後に公開できる", async () => {
  const fixture = await openGame({ initialFailure: true, initialReady: true });
  const preview = page.getByRole("button", { name: ja.games_preview, exact: true });
  const confirm = page.getByRole("button", { name: ja.games_preview_confirm, exact: true });
  const publish = page.getByRole("button", { name: ja.games_publish, exact: true });
  await preview.click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(page.getByTitle(fixture.manifest.name.ja)).not.toBeInTheDocument();
  await expect.element(confirm).not.toBeInTheDocument();
  await expect.element(preview).toBeDisabled();
  await expect.element(publish).toBeDisabled();
  expect(fixture.previewRequests).toBe(1);
  await page.getByRole("button", { name: ja.common_retry, exact: true }).click();
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  await expect.element(page.getByTitle(fixture.manifest.name.ja)).toBeVisible();
  await expect.element(confirm).toBeEnabled();
  await expect.element(publish).toBeDisabled();
  expect(fixture.previewRequests).toBe(2);
  await confirm.click();
  await expect.element(page.getByTitle(fixture.manifest.name.ja)).not.toBeInTheDocument();
  await publish.click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.games_publish, exact: true })
    .click();
  await expect
    .element(page.getByRole("button", { name: ja.games_disable, exact: true }))
    .toBeVisible();
  expect(
    fixture.writes.filter(({ path }) => path.endsWith("/previewed")).map(({ path }) => path),
  ).toEqual([
    "/api/admin/stores/tablecast-store/games/tablecast-turns/versions/tablecast-v1/previewed",
  ]);
  expect(fixture.writes.find(({ path }) => path.endsWith("/publish"))?.value).toEqual({
    versionId: "tablecast-v1",
    expectedRevision: 0,
    approved: true,
  });
});
