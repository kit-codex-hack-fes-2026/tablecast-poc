import { type ConfigDraft, configurationSchema } from "@tablecast/api/schema";
import { detectPlatform } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { z } from "zod";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import "../../styles.css";
import { fixtureValue } from "../../test-support/fixture-value";
import { MenuOverview } from "../catalog/menu-overview";
import { StoreShell } from "../store/store-shell";
import { menuListSearchSchema, menuReviewSearchSchema } from "./menu-model";
import { StoreDesign } from "./store-design";

const storeId = "tablecast-design-store";
const draftId = "tablecast-design-draft";
const api = `/api/admin/stores/${storeId}`;
let client: QueryClient;
let draft: ConfigDraft;
let conflict = false;
let unexpected: string[];
let previewSource: unknown;
let savedVersions: number[];
let initialViewport: { height: number; width: number };
const published = structuredClone(catalog.configuration);
const savedCss = '[data-theme-part="category-button"] { border-style:double; border-width:3px; }';

beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
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
      if (path === `${api}/catalog`)
        return Response.json({ ...catalog, storeId, storeName: "テーマ検証店舗" });
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
  if (window.innerWidth !== initialViewport.width || window.innerHeight !== initialViewport.height)
    await page.viewport(initialViewport.width, initialViewport.height);
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});

function DesignPage() {
  const { draftId: selectedDraft } = useSearch({ from: "/admin/stores/$storeId/design" });
  return <StoreDesign draftId={selectedDraft} />;
}

async function openDesign(initial = `/admin/stores/${storeId}/design?draftId=${draftId}`) {
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
    validateSearch: menuReviewSearchSchema.extend({ draftId: z.string().optional() }),
    component: DesignPage,
  });
  const menu = createRoute({
    getParentRoute: () => store,
    path: "menu/changes/$draftId/$section",
    validateSearch: menuListSearchSchema,
    component: () => <h1>下書きのメニュー</h1>,
  });
  const review = createRoute({
    getParentRoute: () => store,
    path: "menu/changes/$draftId",
    component: () => <h1>下書きの変更確認</h1>,
  });
  const demo = createRoute({
    getParentRoute: () => store,
    path: "demo",
    component: () => <h1>保存済みのテーマをプレビュー中</h1>,
  });
  const product = createRoute({
    getParentRoute: () => store,
    path: "menu/$section/$itemId",
    validateSearch: menuListSearchSchema,
    component: function ProductPage() {
      const { itemId } = useParams({ strict: false });
      if (!itemId) throw new Error("商品IDがありません");
      return (
        <MenuOverview
          configuration={published}
          section="products"
          itemId={itemId}
          search={product.useSearch()}
        />
      );
    },
  });
  const list = createRoute({
    getParentRoute: () => store,
    path: "menu/$section",
    validateSearch: menuListSearchSchema,
    component: () => <h1>公開商品の一覧</h1>,
  });
  const router = createRouter({
    routeTree: root.addChildren([store.addChildren([design, menu, review, demo, product, list])]),
    history: createMemoryHistory({ initialEntries: [initial] }),
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

it("下書きメニューと店舗デザインを往復しても同じ下書きと変更確認を保つ", async () => {
  await page.viewport(1280, 900);
  const { router } = await openDesign(
    `/admin/stores/${storeId}/menu/changes/${draftId}/products?q=tea&page=2`,
  );
  const navigation = page.getByRole("navigation", { name: ja.admin_config, exact: true });
  await navigation.getByRole("link", { name: ja.theme_title, exact: true }).click();
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({ draftId, q: "tea", page: 2, returnSection: "products" });
  await expect.element(page.getByLabelText(ja.theme_css, { exact: true })).toBeVisible();
  await expect.element(navigation.getByRole("status")).not.toBeInTheDocument();
  await expect
    .element(
      page.getByText(m.workflow_current_short({ version: 1 }, { locale: "ja" }), { exact: true }),
    )
    .toBeVisible();
  await expect
    .element(navigation.getByRole("link", { name: ja.editor_products, exact: true }))
    .toHaveAttribute(
      "href",
      `/admin/stores/${storeId}/menu/changes/${draftId}/products?q=tea&page=2`,
    );
  await expect
    .element(navigation.getByRole("link", { name: ja.theme_title, exact: true }))
    .toHaveAttribute(
      "href",
      `/admin/stores/${storeId}/design?q=tea&page=2&returnSection=products&draftId=${draftId}`,
    );
  await navigation.getByRole("link", { name: ja.editor_products, exact: true }).click();
  await expect.element(page.getByRole("heading", { name: "下書きのメニュー" })).toBeVisible();
  await navigation.getByRole("link", { name: ja.theme_title, exact: true }).click();
  await navigation.getByRole("link", { name: ja.admin_drafts, exact: true }).click();
  await expect.element(page.getByRole("heading", { name: "下書きの変更確認" })).toBeVisible();
  expect(router.state.location.pathname).toBe(`/admin/stores/${storeId}/menu/changes/${draftId}`);
});

it("入力中の保存ショートカットで保存し、再表示と版競合で入力を保持する", async () => {
  const { screen } = await openDesign();
  const css = page.getByRole("textbox", { name: ja.theme_css, exact: true });
  await css.fill(savedCss);
  await userEvent.keyboard(
    detectPlatform() === "mac" ? "{Meta>}s{/Meta}" : "{Control>}s{/Control}",
  );
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

it("無効なCSSの保存では項目を示すエラーへfocusし、入力を修正して保存できる", async () => {
  await openDesign();
  const css = page.getByRole("textbox", { name: ja.theme_css, exact: true });
  const invalidCss = "body { display: none; }";
  await css.fill(invalidCss);
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  const errors = page.getByRole("alert");
  await expect.element(errors).toMatchTextContent(ja.theme_css_invalid);
  await expect.element(errors).toHaveFocus();
  await expect.element(css).toHaveValue(invalidCss);
  expect(savedVersions).toEqual([]);
  await css.fill(savedCss);
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.poll(() => savedVersions).toEqual([1]);
  await expect.element(errors).not.toBeInTheDocument();
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

it("公開中のデザインは編集フォームを出さず、商品表示と構成の概要を示す", async () => {
  await page.viewport(1440, 1000);
  const { router } = await openDesign(
    `/admin/stores/${storeId}/design?q=酒&category=tablecast-sake-category&availability=available&page=2`,
  );
  await expect
    .element(page.getByRole("heading", { name: ja.theme_published_overview, exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("heading", { name: ja.theme_configuration_summary, exact: true }))
    .toBeVisible();
  await expect
    .element(page.getByRole("textbox", { name: ja.theme_css, exact: true }))
    .not.toBeInTheDocument();
  await expect
    .element(
      page.getByRole("button", {
        name: new RegExp(fixtureValue(catalog.configuration.products[0]).text.ja.displayName),
      }),
    )
    .toBeVisible();
  await page
    .getByRole("button", {
      name: new RegExp(fixtureValue(catalog.configuration.products[0]).text.ja.displayName),
    })
    .click();
  await expect
    .element(
      page.getByRole("heading", {
        name: fixtureValue(catalog.configuration.products[0]).text.ja.displayName,
        exact: true,
      }),
    )
    .toBeVisible();
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({
      q: "酒",
      category: "tablecast-sake-category",
      availability: "available",
      page: 2,
    });
  await page.getByRole("main").getByRole("link", { name: ja.editor_products, exact: true }).click();
  await expect
    .element(page.getByRole("heading", { name: "公開商品の一覧", exact: true }))
    .toBeVisible();
  await expect
    .poll(() => router.state.location.search)
    .toMatchObject({
      q: "酒",
      category: "tablecast-sake-category",
      availability: "available",
      page: 2,
    });
});
