import type { ConfigDraft } from "@tablecast/api/schema";
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
import { page } from "vitest/browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { configurationSchema } from "@tablecast/api/schema";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import { StoreShell } from "./store-shell";
import { MenuItem } from "./menu-item";
import { DraftPage } from "./settings-drafts";
import { MenuCollection } from "./menu-collection";
import { menuSectionSchema } from "./menu-model";
import "../../styles.css";

let client: QueryClient;
let current: ConfigDraft;
let unexpected: string[];
let requests: Request[];
let saveFailure = 0;
let waitForSave: Promise<void> | undefined;
let waitForCreate: Promise<void> | undefined;
let publishedVersion = 1;
const storeId = "tablecast-workflow-store";
const otherStoreId = "tablecast-workflow-other-store";
const draftId = "tablecast-workflow-draft";
const base = `/admin/stores/${storeId}/menu`;
const api = `/api/admin/stores/${storeId}`;
const inputSchema = z.object({ expectedVersion: z.number(), configuration: configurationSchema });

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  client.setQueryData(["tablecast-session"], null);
  client.setQueryData(["tablecast-stores"], {
    stores: [
      { id: storeId, name: "試験店舗", logo: null, role: "owner", organizationId: "tablecast-org" },
      {
        id: otherStoreId,
        name: "切替先店舗",
        logo: null,
        role: "owner",
        organizationId: "tablecast-org",
      },
    ],
  });
  current = {
    id: draftId,
    storeId,
    baseVersion: 1,
    version: 2,
    status: "draft",
    configuration: structuredClone(catalog.configuration),
    errors: [],
    changes: [{ path: "cast.proactive", before: false, after: true, sensitive: false }],
    createdAt: 1,
    updatedAt: 2,
  };
  requests = [];
  unexpected = [];
  saveFailure = 0;
  waitForSave = undefined;
  waitForCreate = undefined;
  publishedVersion = 1;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      const path = new URL(request.url).pathname;
      if (path === "/api/auth/organization/get-full-organization") return Response.json(null);
      if (path === `/api/admin/stores/${otherStoreId}/catalog`)
        return Response.json({ ...catalog, storeId: otherStoreId });
      if (path === `${api}/catalog`)
        return Response.json({
          ...catalog,
          storeId,
          version: current.status === "published" ? 2 : publishedVersion,
        });
      if (path === "/api/admin/stores")
        return Response.json(client.getQueryData(["tablecast-stores"]));
      if (path === `${api}/drafts/choices`)
        return Response.json({
          drafts: [
            {
              id: draftId,
              baseVersion: 1,
              version: 2,
              status: "draft",
              updatedAt: 2,
              sections: ["products"],
              changeCount: 1,
            },
          ],
          publishedVersion: 1,
          nextCursor: null,
        });
      if (path === `${api}/drafts` && request.method === "POST") {
        await waitForCreate;
        current = { ...current, id: "tablecast-created-draft" };
        return Response.json(current);
      }
      if (path === `${api}/drafts` && request.method === "GET")
        return Response.json({ drafts: [current] });
      if (path === `${api}/drafts/${current.id}` && request.method === "GET")
        return Response.json(current);
      if (path === `${api}/drafts/${current.id}` && request.method === "PUT") {
        await waitForSave;
        if (saveFailure)
          return Response.json(
            { error: { code: saveFailure === 409 ? "DRAFT_CONFLICT" : "UNAVAILABLE" } },
            { status: saveFailure },
          );
        const saved = inputSchema.parse(await request.json());
        current = {
          ...current,
          version: saved.expectedVersion + 1,
          configuration: saved.configuration,
          status: "draft",
        };
        return Response.json(current);
      }
      if (path === `${api}/drafts/${current.id}/validate`) {
        current = { ...current, status: "ready", version: current.version + 1 };
        return Response.json(current);
      }
      if (path === `${api}/drafts/${current.id}/publish`) {
        current = { ...current, status: "published" };
        return Response.json(current);
      }
      if (path === `${api}/drafts/${current.id}/discard`) {
        current = { ...current, status: "discarded" };
        return Response.json(current);
      }
      unexpected.push(`${request.method} ${path}`);
      return Response.json({ error: { code: "UNEXPECTED_REQUEST" } }, { status: 500 });
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

async function open(path: string, locale: "ja" | "en" = "ja") {
  const root = createRootRoute({ component: Outlet });
  const store = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId",
  });
  store.update({
    component: () => <StoreShell storeId={store.useParams<typeof router>().storeId} />,
  });
  const item = createRoute({
    getParentRoute: () => store,
    path: "menu/changes/$draftId/$section/$itemId",
  });
  item.update({
    component: () => {
      const params = item.useParams<typeof router>();
      return (
        <MenuItem
          section={menuSectionSchema.parse(params.section)}
          itemId={params.itemId}
          draftId={params.draftId}
        />
      );
    },
  });
  const review = createRoute({ getParentRoute: () => store, path: "menu/changes/$draftId" });
  review.update({
    component: () => (
      <DraftPage
        key={review.useParams<typeof router>().draftId}
        draftId={review.useParams<typeof router>().draftId}
      />
    ),
  });
  const collection = createRoute({ getParentRoute: () => store, path: "menu/$section" });
  collection.update({
    component: () => (
      <MenuCollection
        section={menuSectionSchema.parse(collection.useParams<typeof router>().section)}
      />
    ),
  });
  const draftCollection = createRoute({
    getParentRoute: () => store,
    path: "menu/changes/$draftId/$section",
  });
  draftCollection.update({
    component: () => (
      <MenuCollection
        section={menuSectionSchema.parse(draftCollection.useParams<typeof router>().section)}
        draftId={draftCollection.useParams<typeof router>().draftId}
      />
    ),
  });
  const router = createRouter({
    routeTree: root.addChildren([store.addChildren([item, review, collection, draftCollection])]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();
  const screen = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <RouterProvider router={router} />
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { screen, router };
}

it.each([503, 409])(
  "保存が%sで失敗しても入力を保持し、再試行で保存して変更確認へ進む",
  async (status) => {
    const product = current.configuration.products[0];
    if (!product) throw new Error("商品fixtureが必要です");
    const { screen, router } = await open(`${base}/changes/${draftId}/products/${product.id}`);
    const price = screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
    await price.fill("777");
    saveFailure = status;
    await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await expect.element(price).toHaveValue(777);
    await expect
      .element(screen.getByRole("link", { name: ja.workflow_review, exact: true }))
      .toBeDisabled();
    saveFailure = 0;
    const pending = Promise.withResolvers<void>();
    waitForSave = pending.promise;
    await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
    await expect.element(price).toBeDisabled();
    await expect.element(screen.getByText(ja.workflow_saving, { exact: true })).toBeVisible();
    pending.resolve();
    await expect.element(screen.getByText(ja.account_saved, { exact: true })).toBeVisible();
    await screen.getByRole("link", { name: ja.workflow_review, exact: true }).click();
    await expect.poll(() => router.state.location.pathname).toBe(`${base}/changes/${draftId}`);
  },
);

it("未保存入力を戻す確認では下書きを破棄せず、最後の保存値へ戻る", async () => {
  const product = current.configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です");
  const { screen } = await open(`${base}/changes/${draftId}/products/${product.id}`);
  const price = screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
  await price.fill("777");
  await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect.element(screen.getByText(ja.account_saved, { exact: true })).toBeVisible();
  await price.fill("888");
  await screen.getByRole("button", { name: ja.workflow_revert, exact: true }).click();
  await screen
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.common_cancel, exact: true })
    .click();
  await expect.element(price).toHaveValue(888);
  await screen.getByRole("button", { name: ja.workflow_revert, exact: true }).click();
  await screen
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.workflow_revert, exact: true })
    .click();
  await expect.element(price).toHaveValue(777);
  expect(requests.filter((request) => request.url.endsWith("/discard"))).toHaveLength(0);
});

it.each(["published", "discarded"] as const)(
  "%sの直接編集URLは閲覧のみになり、保存操作を出さない",
  async (status) => {
    current.status = status;
    const product = current.configuration.products[0];
    if (!product) throw new Error("商品fixtureが必要です");
    const { screen } = await open(`${base}/changes/${draftId}/products/${product.id}`);
    await expect
      .element(screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true }))
      .toBeDisabled();
    await expect
      .element(screen.getByRole("button", { name: ja.common_save, exact: true }))
      .not.toBeInTheDocument();
    await expect
      .element(screen.getByText(ja.workflow_terminal_note, { exact: true }))
      .toBeVisible();
  },
);

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)(
  "$localeで検証後に公開内容を確認し、承認するまで公開要求を送らない",
  async ({ locale, labels }) => {
    const { screen } = await open(`${base}/changes/${draftId}`, locale);
    const publish = screen.getByRole("button", { name: labels.admin_publish, exact: true });
    await expect.element(publish).toBeDisabled();
    await screen.getByRole("button", { name: labels.admin_validate, exact: true }).click();
    await expect.element(publish).toBeEnabled();
    await publish.click();
    const confirmation = screen.getByRole("dialog", {
      name: labels.workflow_publish_title,
      exact: true,
    });
    await expect.element(confirmation).toBeVisible();
    expect(requests.filter((request) => request.url.endsWith("/publish"))).toHaveLength(0);
    await confirmation.getByRole("button", { name: labels.common_cancel, exact: true }).click();
    await expect.element(publish).toHaveFocus();
    await publish.click();
    await confirmation.getByRole("button", { name: labels.admin_publish, exact: true }).click();
    await expect
      .element(screen.getByRole("link", { name: labels.workflow_view_published, exact: true }))
      .toBeVisible();
    const publications = requests.filter((request) => request.url.endsWith("/publish"));
    expect(publications).toHaveLength(1);
    expect(await publications[0]?.json()).toMatchObject({
      approved: true,
      baseVersion: 1,
      expectedVersion: 3,
    });
    await page.screenshot({
      path: `../../../test-results/browser/tablecast-workflow-${locale}.png`,
    });
  },
);

it("編集開始では再開と新規を選び、再開時は下書きを増やさない", async () => {
  const { screen, router } = await open(`${base}/products`);
  await screen.getByRole("button", { name: ja.menu_start_editing, exact: true }).click();
  const choice = screen.getByRole("dialog", { name: ja.workflow_choose_title, exact: true });
  await expect
    .element(choice.getByRole("button", { name: ja.editor_create_draft, exact: true }))
    .toBeVisible();
  await choice.getByRole("button", { name: ja.workflow_resume, exact: true }).click();
  await expect
    .poll(() => router.state.location.pathname)
    .toBe(`${base}/changes/${draftId}/products`);
  expect(requests.filter((request) => request.method === "POST")).toHaveLength(0);
});

it("版競合後の再読込は確認するまで入力を残し、承認後に最新の保存値を復元する", async () => {
  const product = current.configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です");
  const { screen } = await open(`${base}/changes/${draftId}/products/${product.id}`);
  const price = screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
  await price.fill("777");
  current = {
    ...current,
    version: 8,
    configuration: {
      ...current.configuration,
      products: current.configuration.products.map((item) =>
        item.id === product.id ? { ...item, price: 900 } : item,
      ),
    },
  };
  saveFailure = 409;
  await screen.getByRole("button", { name: ja.common_save, exact: true }).click();
  const reload = screen.getByRole("button", { name: ja.workflow_conflict_reload, exact: true });
  await reload.click();
  const confirmation = screen.getByRole("alertdialog");
  await confirmation.getByRole("button", { name: ja.common_cancel, exact: true }).click();
  await expect.element(price).toHaveValue(777);
  await reload.click();
  await confirmation
    .getByRole("button", { name: ja.workflow_conflict_reload, exact: true })
    .click();
  await expect.element(price).toHaveValue(900);
  await expect.element(screen.getByRole("alert")).not.toBeInTheDocument();
  expect(current.version).toBe(8);
});

it("未保存で別設定へ移動しようとすると入力を保護し、取り消して編集を続けられる", async () => {
  const product = current.configuration.products[0];
  if (!product) throw new Error("商品fixtureが必要です");
  const path = `${base}/changes/${draftId}/products/${product.id}`;
  const { screen, router } = await open(path);
  const price = screen.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
  await price.fill("777");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await screen
    .getByRole("main")
    .getByRole("link", { name: ja.editor_products, exact: true })
    .click();
  expect(confirm).toHaveBeenCalledWith(ja.menu_leave_unsaved);
  expect(router.state.location.pathname).toBe(path);
  await expect.element(price).toHaveValue(777);
});

it("iPad縦向きと文字拡大でも古い公開版の公開不能理由と戻り先が見える", async () => {
  await page.viewport(768, 1024);
  const previousFontSize = document.documentElement.style.fontSize;
  document.documentElement.style.fontSize = "32px";
  try {
    current.status = "ready";
    publishedVersion = 2;
    const { screen } = await open(`${base}/changes/${draftId}`);
    await expect
      .element(screen.getByRole("button", { name: ja.admin_publish, exact: true }))
      .toBeDisabled();
    await expect.element(screen.getByText(ja.workflow_stale, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: ja.workflow_view_published, exact: true }))
      .toBeVisible();
    const header = screen.getByRole("main").element().querySelector("header");
    if (!header) throw new Error("設定のヘッダーが必要です");
    expect(header.getBoundingClientRect().height).toBeLessThan(window.innerHeight / 2);
    const publishedLink = screen
      .getByRole("link", { name: ja.workflow_view_published, exact: true })
      .element();
    publishedLink.scrollIntoView({ block: "center" });
    expect(publishedLink.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      header.getBoundingClientRect().bottom,
    );
    expect(publishedLink.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await page.screenshot({
      path: "../../../test-results/browser/tablecast-workflow-ipad-large-text.png",
    });
  } finally {
    document.documentElement.style.fontSize = previousFontSize;
    await page.viewport(1024, 768);
  }
});

it.each(["閉じて開き直す", "店舗を切り替える"])(
  "新規下書きの作成中に%sと、遅延応答で元の編集先へ移動しない",
  async (action) => {
    const pending = Promise.withResolvers<void>();
    waitForCreate = pending.promise;
    const { screen, router } = await open(`${base}/products`);
    await screen.getByRole("button", { name: ja.menu_start_editing, exact: true }).click();
    const choice = screen.getByRole("dialog", { name: ja.workflow_choose_title, exact: true });
    await choice.getByRole("button", { name: ja.editor_create_draft, exact: true }).click();
    await expect
      .element(choice.getByRole("button", { name: ja.workflow_saving, exact: true }))
      .toBeDisabled();
    await choice.getByRole("button", { name: ja.common_close, exact: true }).click();
    const destination =
      action === "店舗を切り替える"
        ? `/admin/stores/${otherStoreId}/menu/products`
        : `${base}/products`;
    if (action === "店舗を切り替える") {
      await router.navigate({
        to: "/admin/stores/$storeId/menu/$section",
        params: { storeId: otherStoreId, section: "products" },
      });
    } else {
      await screen.getByRole("button", { name: ja.menu_start_editing, exact: true }).click();
    }
    pending.resolve();
    await expect.poll(() => client.isMutating()).toBe(0);
    expect(router.state.location.pathname).toBe(destination);
    expect(
      client.getQueryData(["tablecast-draft", storeId, "tablecast-created-draft"]),
    ).toMatchObject({ id: "tablecast-created-draft" });
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(1);
  },
);
