import { configurationSchema, type ConfigDraft } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { StoreDesign } from "./store-design";
import { StoreShell } from "./store-shell";
import "../../styles.css";

const storeId = "tablecast-design-store";
const draftId = "tablecast-design-draft";
const api = `/api/admin/stores/${storeId}`;
let client: QueryClient;
let draft: ConfigDraft;
let conflict = false;
let unexpected: string[];
let previewSource: unknown;
let savedVersions: number[];
const published = structuredClone(catalog.configuration);
const savedCss = '[data-theme-part="category-button"] { border-style:double; border-width:3px; }';

beforeEach(() => {
  draft = {
    id: draftId,
    storeId,
    baseVersion: 1,
    version: 1,
    status: "draft",
    configuration: structuredClone(published),
    errors: [],
    changes: [],
    createdAt: 1,
    updatedAt: 1,
  };
  conflict = false;
  unexpected = [];
  previewSource = undefined;
  savedVersions = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path === "/api/auth/organization/get-full-organization") return Response.json(null);
      if (path === `${api}/drafts/${draftId}` && request.method === "GET")
        return Response.json(draft);
      if (path === `${api}/drafts/${draftId}` && request.method === "PUT") {
        if (conflict) return Response.json({ error: { code: "DRAFT_CONFLICT" } }, { status: 409 });
        const body = z
          .object({ expectedVersion: z.number(), configuration: configurationSchema })
          .parse(await request.json());
        savedVersions.push(body.expectedVersion);
        draft = { ...draft, configuration: body.configuration, version: draft.version + 1 };
        return Response.json(draft);
      }
      if (path === `${api}/demo` && request.method === "POST")
        return Response.json({ id: "tablecast-design-demo", version: 1 });
      if (path === `${api}/demo/tablecast-design-demo` && request.method === "PATCH") {
        previewSource = await request.json();
        return Response.json({ id: "tablecast-design-demo", version: 2 });
      }
      unexpected.push(`${request.method} ${path}`);
      return Response.json({ error: { code: "UNEXPECTED_TEST_REQUEST" } }, { status: 500 });
    }),
  );
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});

async function openDesign() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["tablecast-session"], null);
  client.setQueryData(["tablecast-stores"], {
    stores: [
      {
        id: storeId,
        name: "テーマ検証店舗",
        logo: null,
        role: "owner",
        organizationId: "tablecast-design-org",
      },
    ],
  });
  const root = createRootRoute();
  const store = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
    component: () => <StoreShell storeId={storeId} />,
  });
  const design = createRoute({
    getParentRoute: () => store,
    path: "design",
    component: () => <StoreDesign draftId={draftId} />,
  });
  const demo = createRoute({
    getParentRoute: () => store,
    path: "demo",
    component: () => <h1>保存済みのテーマをプレビュー中</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([store.addChildren([design, demo])]),
    history: createMemoryHistory({ initialEntries: [`/admin/stores/${storeId}/design`] }),
  });
  await router.load();
  const screen = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale="ja" persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { screen, router };
}

it("テーマの保存値は再表示で戻り、版競合時は確認するまで編集中のCSSを保持する", async () => {
  const { screen } = await openDesign();
  const css = page.getByRole("textbox", { name: ja.theme_css, exact: true });
  await css.fill(savedCss);
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect
    .element(page.getByRole("status").filter({ hasText: ja.account_saved }))
    .toBeVisible();
  await screen.unmount();
  client.clear();
  await openDesign();
  await expect.element(css).toHaveValue(savedCss);
  expect(savedVersions).toEqual([1]);
  draft.version += 1;
  conflict = true;
  const local = '[data-theme-part="product-card"] { border-width:4px; }';
  await css.fill(local);
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.element(page.getByRole("alert")).toMatchTextContent(ja.common_conflict);
  await expect.element(css).toHaveValue(local);
  await page.getByRole("button", { name: ja.workflow_conflict_reload, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.common_cancel, exact: true })
    .click();
  await expect.element(css).toHaveValue(local);
  await page.getByRole("button", { name: ja.workflow_conflict_reload, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.workflow_conflict_reload, exact: true })
    .click();
  await expect.element(css).toHaveValue(savedCss);
  expect(draft.configuration.appearance?.customCss).toBe(savedCss);
});

it("未保存のテーマをプレビューすると先に保存し、その下書きを選んだデモへ移動する", async () => {
  const { router } = await openDesign();
  await page.getByLabelText(ja.theme_logo_width, { exact: true }).fill("300");
  await page.getByRole("button", { name: ja.theme_preview, exact: true }).click();
  await expect
    .element(page.getByRole("heading", { name: "保存済みのテーマをプレビュー中" }))
    .toBeVisible();
  expect(draft.configuration.appearance?.composition?.masthead?.logoWidth).toBe(300);
  expect(previewSource).toEqual({ expectedVersion: 1, sourceDraftId: draftId });
  expect(savedVersions).toEqual([1]);
  expect(router.state.location.search).toMatchObject({
    demoId: "tablecast-design-demo",
    device: "ipad",
  });
});
