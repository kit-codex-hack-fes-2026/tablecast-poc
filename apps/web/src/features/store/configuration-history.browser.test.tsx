import { parseFlatSearch, stringifyFlatSearch } from "../../lib/router-search";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import type { ConfigurationHistoryPage, ConfigurationRelease, Locale } from "@tablecast/api/schema";
import { catalog, configurationHistoryFixture } from "../../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../../i18n/locale";
import { MotionProvider } from "../../components/motion-provider";
import { PanelLayoutProvider } from "../../lib/panel-layout";
import { StoreShell } from "./store-shell";
import { ConfigurationHistory } from "./configuration-history";
import { configurationHistorySearchSchema } from "./configuration-history-query";
import "../../styles.css";

let client: QueryClient;
let requests: Request[];
let unexpected: string[];
let history: ConfigurationHistoryPage;
let release: ConfigurationRelease;
let failNext: boolean;
let restoreStatus: number;
let restored: { draftId: string; baseVersion: number }[];
const storeId = "tablecast-history-store";
class TablecastSocket extends EventTarget {
  close() {}
}

beforeEach(() => {
  requests = [];
  unexpected = [];
  restored = [];
  failNext = false;
  restoreStatus = 200;
  history = structuredClone(configurationHistoryFixture);
  release = {
    version: 1,
    publishedVersion: 2,
    sourceDraftId: null,
    publishedAt: 1792270800000,
    publishedBy: "tablecast-staff",
    publisherName: "佐藤 晴香",
    publisherEmail: "staff@example.test",
    publisherImage: null,
    configuration: catalog.configuration,
    changes: [],
  };
  vi.stubGlobal("WebSocket", TablecastSocket);
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    requests.push(request);
    if (url.pathname.endsWith("/configuration/history")) {
      if (url.searchParams.has("beforeId") && failNext)
        return Response.json({ error: { code: "UNAVAILABLE" } }, { status: 503 });
      return Response.json(
        url.searchParams.has("beforeId") ? { ...history, entries: [], nextCursor: null } : history,
      );
    }
    if (url.pathname.endsWith("/restore")) {
      const body: { draftId: string; baseVersion: number } = await request.json();
      restored.push(body);
      if (restoreStatus !== 200)
        return Response.json({ error: { code: "DRAFT_CONFLICT" } }, { status: restoreStatus });
      return Response.json({
        id: body.draftId,
        baseVersion: body.baseVersion,
        version: 1,
        status: "draft",
        storeId,
        createdAt: 1,
        updatedAt: 1,
        errors: [],
        changes: [],
        configuration: release.configuration,
      });
    }
    if (url.pathname.includes("/configuration/releases/")) return Response.json(release);
    if (url.pathname === "/api/auth/organization/get-full-organization") return Response.json(null);
    if (url.pathname.endsWith("/catalog"))
      return Response.json({ ...catalog, storeId, version: release.publishedVersion });
    if (url.pathname.endsWith("/events")) return Response.json({ events: [], cursor: 0 });
    unexpected.push(`${request.method} ${url.pathname}`);
    return Response.json({}, { status: 500 });
  });
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  await page.viewport(1024, 768);
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});
async function show({
  role = "owner",
  locale = "ja",
  initial = `/admin/stores/${storeId}/menu/history`,
}: { role?: string; locale?: Locale; initial?: string } = {}) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["tablecast-session"], null);
  client.setQueryData(["tablecast-stores"], {
    stores: [
      {
        id: storeId,
        name: "履歴試験店",
        logo: null,
        role,
        organizationId: "tablecast-history-org",
      },
      {
        id: "tablecast-second-store",
        name: "別の店舗",
        logo: null,
        role,
        organizationId: "tablecast-second-org",
      },
    ],
  });
  const root = createRootRoute();
  const store = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
    component: () => <StoreShell storeId={store.useParams().storeId} />,
  });
  const historyRoute = createRoute({
    getParentRoute: () => store,
    path: "menu/history",
    validateSearch: configurationHistorySearchSchema,
    component: function HistoryPage() {
      const navigate = historyRoute.useNavigate();
      return (
        <ConfigurationHistory
          version={historyRoute.useSearch().version}
          onSelect={(version) => void navigate({ search: { version } })}
        />
      );
    },
  });
  const draft = createRoute({
    getParentRoute: () => store,
    path: "menu/changes/$draftId",
    component: () => <h1>新しい下書きの確認</h1>,
  });
  const router = createRouter({
    parseSearch: parseFlatSearch,
    stringifySearch: stringifyFlatSearch,
    routeTree: root.addChildren([store.addChildren([historyRoute, draft])]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  await router.load();
  await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <PanelLayoutProvider cookies="">
            <RouterProvider router={router} />
          </PanelLayoutProvider>
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return router;
}
it("続きの失敗でも既存履歴を残し、再試行と公開版のキーボード選択から戻れる", async () => {
  history.nextCursor = { beforeAt: 1792270800000, beforeKind: "release", beforeId: "1" };
  await show();
  const old = page.getByRole("button", { name: "公開版 1", exact: true });
  await expect.element(old).toBeVisible();
  failNext = true;
  await page.getByRole("button", { name: "以前の履歴を読み込む" }).click();
  await expect.element(page.getByRole("alert")).toBeVisible();
  await expect.element(old).toBeVisible();
  failNext = false;
  await page.getByRole("button", { name: "再試行", exact: true }).click();
  await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
  old.element().focus();
  await userEvent.keyboard("{Enter}");
  await expect.element(page.getByRole("dialog", { name: "公開版 1", exact: true })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  await expect.element(old).toHaveFocus();
});
it("過去版は影響を確認してから下書きを作り、競合後は現在版を読み直して明示的に再開する", async () => {
  const router = await show();
  await page.getByRole("button", { name: "公開版 1", exact: true }).click();
  await page.getByRole("button", { name: "この版の内容を使う" }).click();
  await expect.element(page.getByRole("heading", { name: "復元する内容を確認" })).toHaveFocus();
  expect(restored).toHaveLength(0);
  restoreStatus = 409;
  await page.getByRole("button", { name: "復元用の下書きを作る" }).click();
  await expect.element(page.getByRole("button", { name: "復元用の下書きを作る" })).toBeDisabled();
  release.publishedVersion = 3;
  await page.getByRole("button", { name: "現在の公開版を読み直す" }).click();
  await page.getByRole("button", { name: "この版の内容を使う" }).click();
  await expect.element(page.getByText(/現在の公開版 3 を基準/)).toBeVisible();
  restoreStatus = 200;
  await page.getByRole("button", { name: "復元用の下書きを作る" }).click();
  await expect.element(page.getByRole("heading", { name: "新しい下書きの確認" })).toBeVisible();
  expect(restored.map((body) => body.baseVersion)).toEqual([2, 3]);
  expect(router.state.location.pathname).toBe(
    `/admin/stores/${storeId}/menu/changes/${restored[1]?.draftId}`,
  );
});
it("英語390pxの直接リンクで非互換版を説明し、復元操作を表示しない", async () => {
  await page.viewport(390, 844);
  release.configuration = null;
  await show({ locale: "en", initial: `/admin/stores/${storeId}/menu/history?version=1` });
  const dialog = page.getByRole("dialog", { name: "Published version 1", exact: true });
  await expect.element(dialog).toBeVisible();
  await expect
    .element(page.getByRole("alert"))
    .toHaveTextContent(
      "This version cannot be restored because its settings are incompatible with the current format. Published settings remain unchanged.",
    );
  await expect
    .element(page.getByRole("button", { name: "Use this version" }))
    .not.toBeInTheDocument();
  expect(dialog.element().scrollWidth).toBeLessThanOrEqual(dialog.element().clientWidth);
});
it("一般スタッフには履歴を取得せず、管理専用の案内を示す", async () => {
  await show({ role: "member" });
  await expect.element(page.getByText("この操作の権限がありません。")).toBeVisible();
  expect(requests.some((request) => request.url.includes("/configuration/"))).toBe(false);
});

it("店舗を切り替えると、前の店舗の履歴と選択を引き継がない", async () => {
  const router = await show();
  await expect.element(page.getByRole("button", { name: "公開版 1", exact: true })).toBeVisible();
  history.entries = [];
  await router.navigate({
    to: "/admin/stores/$storeId/menu/history",
    params: { storeId: "tablecast-second-store" },
    search: {},
  });
  await expect.element(page.getByText("保存された公開履歴はまだありません。")).toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "公開版 1", exact: true }))
    .not.toBeInTheDocument();
});
