import type { Catalog, ConfigDraft, Locale } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { page, userEvent } from "vitest/browser";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { catalog, product } from "../../../.storybook/tablecast-fixtures";
import ja from "../../../messages/ja.json";
import en from "../../../messages/en.json";
import { LocaleProvider } from "../../i18n/locale";
import { MenuCollection } from "./menu-collection";
import { MenuOverview } from "./menu-overview";
import { menuListSearchSchema, menuReviewSearchSchema, menuSectionSchema } from "./menu-model";
import { catalogOptions, draftOptions } from "./menu-query";
import { DraftPage } from "./settings-drafts";
import "../../styles.css";

vi.mock("./store-shell", () => ({ useStore: () => ({ id: "tablecast-story", role: "member" }) }));
let client: QueryClient;
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function showMenu(
  value: Catalog | undefined,
  locale: Locale = "ja",
  path = "/admin/stores/tablecast-story/menu/products",
) {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } },
  });
  if (value) client.setQueryData(catalogOptions(value.storeId).queryKey, value);
  if (value)
    client.setQueryData(draftOptions(value.storeId, "tablecast-published-draft").queryKey, {
      id: "tablecast-published-draft",
      storeId: value.storeId,
      version: 2,
      baseVersion: 1,
      status: "published",
      configuration: value.configuration,
      errors: [],
      changes: [],
      createdAt: 1,
      updatedAt: 2,
    } satisfies ConfigDraft);
  const root = createRootRoute();
  const list = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/menu/$section",
    validateSearch: menuListSearchSchema,
    params: {
      parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }),
    },
    component: function Collection() {
      return <MenuCollection section={list.useParams().section} search={list.useSearch()} />;
    },
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/menu/$section/$itemId",
    validateSearch: menuListSearchSchema,
    params: {
      parse: (params) => ({ ...params, section: menuSectionSchema.parse(params.section) }),
    },
    component: function Overview() {
      const { section, itemId } = detail.useParams();
      return (
        <MenuOverview
          configuration={(value ?? catalog).configuration}
          section={section}
          itemId={itemId}
          search={detail.useSearch()}
        />
      );
    },
  });
  const review = createRoute({
    getParentRoute: () => root,
    path: "/admin/stores/$storeId/menu/changes/$draftId",
    validateSearch: menuReviewSearchSchema,
    component: function Review() {
      return <DraftPage draftId={review.useParams().draftId} search={review.useSearch()} />;
    },
  });
  const router = createRouter({
    routeTree: root.addChildren([list, detail, review]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const screen = await render(
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <main className="space-y-6 p-6">
          <RouterProvider router={router} />
        </main>
      </LocaleProvider>
    </QueryClientProvider>,
  );
  return { screen, router };
}

it.each(["tr", "az"])("ホストの%sロケールでもIced teaをicedとICEDで検索できる", async (locale) => {
  // oxlint-disable-next-line typescript/unbound-method -- 保存したメソッドはcallで明示的なthisを渡して使う。
  const lowerCase = String.prototype.toLocaleLowerCase;
  vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(
    function (this: string, locales) {
      return lowerCase.call(this, locales ?? locale);
    },
  );
  const value = structuredClone(catalog);
  value.configuration.products = ["Iced tea", "iced tea"].map((displayName, index) => ({
    ...structuredClone(product),
    id: `tablecast-iced-tea-${index}`,
    text: { ...product.text, en: { ...product.text.en, displayName } },
  }));
  const { screen } = await showMenu(value, "en");
  for (const query of ["iced", "ICED"]) {
    await screen.getByRole("searchbox", { name: en.menu_search }).fill(query);
    await expect.element(screen.getByText("Iced tea", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("iced tea", { exact: true })).toBeVisible();
  }
});

for (const locale of ["ja", "en"] as const) {
  const labels = locale === "ja" ? ja : en;
  it(`${locale}の商品一覧で他言語・別名とカテゴリ・販売状態を検索し、詳細から戻ると同じ条件とページを保つ`, async () => {
    await page.viewport(1280, 800);
    const value = structuredClone(catalog);
    value.configuration.products = Array.from({ length: 25 }, (_, index) => ({
      ...structuredClone(product),
      id: `tablecast-product-${index}`,
      text: {
        ja: { ...product.text.ja, displayName: `日本酒 ${index}`, aliases: ["月の酒"] },
        en: { ...product.text.en, displayName: `Sake ${index}`, aliases: ["moon drink"] },
      },
    }));
    value.configuration.categories.push({
      id: "tablecast-other-category",
      text: {
        ja: { ...product.text.ja, displayName: "その他" },
        en: { ...product.text.en, displayName: "Other" },
      },
    });
    value.configuration.products.push({
      ...structuredClone(value.configuration.products[0]),
      id: "tablecast-other-product",
      categoryId: "tablecast-other-category",
    });
    value.configuration.products.push({
      ...structuredClone(product),
      id: "tablecast-unavailable",
      available: false,
    });
    const { screen, router } = await showMenu(value, locale);
    const search = screen.getByRole("searchbox", { name: labels.menu_search });
    await search.fill(locale === "ja" ? "moon drink" : "月の酒");
    await expect
      .element(
        screen.getByText(labels.common_result_count.replace("{count}", "26"), { exact: true }),
      )
      .toBeVisible();
    await screen
      .getByRole("combobox", { name: labels.editor_category, exact: true })
      .selectOptions("tablecast-sake-category");
    await screen
      .getByRole("combobox", { name: labels.menu_availability })
      .selectOptions("available");
    await screen.getByRole("button", { name: labels.common_next_page }).click();
    await expect.element(screen.getByText("2 / 2", { exact: true })).toBeVisible();
    const expectedSearch = router.state.location.search;
    const detailLink = screen
      .getByRole("row")
      .filter({ hasText: locale === "ja" ? "日本酒 20" : "Sake 20" })
      .getByRole("link", { name: labels.admin_details });
    detailLink.element().focus();
    await expect.element(detailLink).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect
      .element(
        screen.getByRole("heading", {
          name: locale === "ja" ? "日本酒 20" : "Sake 20",
          exact: true,
        }),
      )
      .toBeVisible();
    await screen.getByRole("link", { name: labels.editor_products, exact: true }).click();
    await expect.element(screen.getByText("2 / 2", { exact: true })).toBeVisible();
    expect(router.state.location.search).toEqual(expectedSearch);
    await screen
      .getByRole("row")
      .filter({ hasText: locale === "ja" ? "日本酒 20" : "Sake 20" })
      .getByRole("link", { name: labels.admin_details })
      .click();
    router.history.back();
    await expect.element(screen.getByText("2 / 2", { exact: true })).toBeVisible();
    expect(router.state.location.search).toEqual(expectedSearch);
    await search.fill(locale === "ja" ? "Sake" : "日本酒");
    await expect.element(screen.getByText("1 / 2", { exact: true })).toBeVisible();
    await screen
      .getByRole("combobox", { name: labels.menu_availability })
      .selectOptions("sold-out");
    await expect
      .element(
        screen.getByText(labels.common_result_count.replace("{count}", "1"), { exact: true }),
      )
      .toBeVisible();
    for (const [label, width, height] of [
      ["desktop", 1280, 800],
      ["ipad-portrait", 768, 1024],
      ["ipad-landscape", 1024, 768],
      ["ipad-content", 728, 768],
    ] as const) {
      await page.viewport(width, height);
      await page.screenshot({
        path: `../../test-results/browser/tablecast-menu-filters-${locale}-${label}.png`,
      });
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      expect(
        screen
          .getByRole("link", { name: labels.admin_details, exact: true })
          .element()
          .getBoundingClientRect().right,
      ).toBeLessThanOrEqual(width);
    }
    await page.viewport(1024, 768);
    const previousSize = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    try {
      await expect
        .element(screen.getByRole("combobox", { name: labels.menu_availability }))
        .toBeVisible();
      await page.screenshot({
        path: `../../test-results/browser/tablecast-menu-filters-${locale}-large-text.png`,
      });
    } finally {
      document.documentElement.style.fontSize = previousSize;
    }
    await search.fill("存在しない検索");
    await expect.element(screen.getByText(labels.common_no_results, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText(labels.menu_no_items, { exact: true }))
      .not.toBeInTheDocument();
  });
}

it("カテゴリに所属商品と件数を表示し、プランに価格・対象・終了前の注文制約を表示する", async () => {
  const value = structuredClone(catalog);
  value.configuration.plans = [
    {
      id: "tablecast-plan",
      text: product.text,
      pricePerPerson: 3200,
      durationMinutes: 90,
      lastOrderMinutesBeforeEnd: 15,
      productIds: [product.id],
      categoryIds: [product.categoryId],
      tags: ["seasonal"],
      maxPerOrder: 1,
      maxTotalPerPerson: 10,
      intervalSeconds: 0,
      excludedOptionIds: [],
      includedOptionSurcharge: false,
    },
  ];
  const { screen, router } = await showMenu(
    value,
    "ja",
    "/admin/stores/tablecast-story/menu/categories",
  );
  const category = screen.getByRole("row").filter({ hasText: "日本酒" });
  await expect.element(category.getByText("2", { exact: true })).toBeVisible();
  await expect.element(category.getByText(/こもれび 月凪/)).toBeVisible();
  await router.navigate({
    to: "/admin/stores/$storeId/menu/$section",
    params: { storeId: value.storeId, section: "plans" },
  });
  await expect
    .element(screen.getByRole("columnheader", { name: ja.editor_plan_price }))
    .toBeVisible();
  await expect.element(screen.getByText("¥3,200", { exact: true })).toBeVisible();
  await expect.element(screen.getByText("利用時間 90分", { exact: true })).toBeVisible();
  await expect
    .element(screen.getByText("ラストオーダー 終了15分前", { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText(/日本酒 · seasonal/)).toBeVisible();
  await page.screenshot({ path: "../../test-results/browser/tablecast-menu-plans-ja.png" });
  await screen.getByRole("link", { name: ja.admin_details, exact: true }).click();
  await expect
    .element(screen.getByRole("heading", { name: ja.editor_tags, exact: true }))
    .toBeVisible();
  await expect.element(screen.getByText("seasonal", { exact: true })).toBeVisible();
});

it("初回読込・通信失敗・登録なしを区別し、再取得失敗でも商品と検索条件を残す", async () => {
  const initial = Promise.withResolvers<Response>();
  const retry = Promise.withResolvers<Response>();
  const refresh = Promise.withResolvers<Response>();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(retry.promise)
      .mockReturnValueOnce(refresh.promise),
  );
  const { screen } = await showMenu(undefined);
  await expect
    .element(screen.getByRole("status").filter({ hasText: ja.common_loading }))
    .toBeVisible();
  await expect.element(screen.getByText(ja.menu_no_items, { exact: true })).not.toBeInTheDocument();
  initial.resolve(Response.json({ error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503 }));
  await expect.element(screen.getByRole("alert")).toBeVisible();
  await expect.element(screen.getByText(ja.menu_no_items, { exact: true })).not.toBeInTheDocument();
  await screen.getByRole("button", { name: ja.common_retry, exact: true }).click();
  retry.resolve(Response.json(catalog));
  await expect
    .element(screen.getByText(product.text.ja.displayName, { exact: true }))
    .toBeVisible();
  await screen.getByRole("searchbox", { name: ja.menu_search }).fill("Sake");
  void client.refetchQueries({ queryKey: catalogOptions(catalog.storeId).queryKey });
  refresh.resolve(Response.json({ error: { code: "SERVICE_UNAVAILABLE" } }, { status: 503 }));
  await expect.element(screen.getByRole("alert")).toBeVisible();
  await expect
    .element(screen.getByText(product.text.ja.displayName, { exact: true }))
    .toBeVisible();
  await expect.element(screen.getByRole("searchbox", { name: ja.menu_search })).toHaveValue("Sake");
  const empty = structuredClone(catalog);
  empty.configuration.products = [];
  client.setQueryData(catalogOptions(catalog.storeId).queryKey, empty);
  await screen.getByRole("searchbox", { name: ja.menu_search }).fill("");
  await expect.element(screen.getByText(ja.menu_no_items, { exact: true })).toBeVisible();
});

it("公開確認から元のプラン一覧へ検索とページを戻し、別の一覧へ進むと条件を引き継がない", async () => {
  const { screen, router } = await showMenu(
    catalog,
    "ja",
    "/admin/stores/tablecast-story/menu/changes/tablecast-published-draft?q=Sake&page=2&returnSection=plans",
  );
  await screen.getByRole("link", { name: ja.workflow_view_published }).click();
  expect(router.state.location.pathname).toBe("/admin/stores/tablecast-story/menu/plans");
  expect(router.state.location.search).toEqual({ q: "Sake", page: 2 });
  router.history.back();
  await screen.getByRole("link", { name: ja.editor_products, exact: true }).click();
  expect(router.state.location.pathname).toBe("/admin/stores/tablecast-story/menu/products");
  expect(router.state.location.search).toEqual({});
});
