import { resolveLocalized } from "@tablecast/api/localization";
import { expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { fixtureValue } from "../../test-support/fixture-value";
import { catalog, product } from "../../test-support/tablecast-fixtures";
import { fixture, showMenu } from "./test-support/menu-collection-fixture";
import "../../styles.css";

it.each([
  { locale: "ja" as const, draft: false },
  { locale: "en" as const, draft: true },
])(
  "$locale / 公開版・下書きでかな・誤字・説明文を検索し、絞込みと詳細からの復帰を保つ",
  async ({ locale, draft }) => {
    await page.viewport(1280, 800);
    const value = structuredClone(catalog);
    const chicken = {
      ...structuredClone(product),
      id: "tablecast-chicken",
      text: {
        ja: {
          displayName: "唐揚げ",
          speechName: "からあげ",
          transliteration: "からあげ",
          aliases: [],
          description: "柚子を添えた温かい料理",
        },
        en: {
          displayName: "Fried chicken",
          speechName: "Fried chicken",
          transliteration: "Fried chicken",
          aliases: [],
          description: "Chicken with a citrus garnish",
        },
      },
    };
    value.configuration.products = [
      chicken,
      { ...structuredClone(chicken), id: "tablecast-sold-out", available: false },
      { ...structuredClone(product), id: "tablecast-unrelated" },
    ];
    const labels = locale === "ja" ? ja : en;
    const path = draft
      ? "/admin/stores/tablecast-story/menu/changes/tablecast-published-draft/products"
      : "/admin/stores/tablecast-story/menu/products";
    const { screen, router } = await showMenu(value, locale, path, "draft");
    const search = screen.getByRole("searchbox", { name: labels.menu_search });
    const name = resolveLocalized(chicken.text, locale).displayName;
    for (const query of ["ｶﾗｱｹﾞ", "からあけ", "柚子", "citrus garnish"]) {
      await search.fill(query);
      await expect
        .element(
          screen.getByText(labels.common_result_count.replace("{count}", "2"), { exact: true }),
        )
        .toBeVisible();
      await expect
        .element(
          screen.getByText(resolveLocalized(product.text, locale).displayName, { exact: true }),
        )
        .not.toBeInTheDocument();
    }
    await screen.getByRole("combobox", { name: labels.editor_category, exact: true }).click();
    const category = value.configuration.categories.find((item) => item.id === chicken.categoryId);
    if (!category) throw new Error("検索対象のカテゴリがありません");
    await page
      .getByRole("option", {
        name: resolveLocalized(category.text, locale).displayName,
        exact: true,
      })
      .click();
    await screen.getByRole("combobox", { name: labels.menu_availability }).click();
    await page.getByRole("option", { name: labels.editor_available, exact: true }).click();
    await expect
      .element(
        screen.getByText(labels.common_result_count.replace("{count}", "1"), { exact: true }),
      )
      .toBeVisible();
    await search.fill("からあけ");
    const expectedSearch = router.state.location.search;
    const link = screen.getByRole("link", { name, exact: true });
    await expect.element(link).toBeVisible();
    const destination = new URL(link.element().getAttribute("href") ?? "", window.location.href);
    expect(destination.pathname).toContain(
      draft ? "/changes/tablecast-published-draft/products/" : "/menu/products/",
    );
    await link.click();
    await expect.element(screen.getByRole("heading", { name, exact: true })).toBeVisible();
    router.history.back();
    await expect.element(screen.getByRole("link", { name, exact: true })).toBeVisible();
    expect(router.state.location.search).toEqual(expectedSearch);
    await expect.element(search).toHaveValue("からあけ");
    await search.fill("");
    await expect
      .element(
        screen.getByText(labels.common_result_count.replace("{count}", "2"), { exact: true }),
      )
      .toBeVisible();
  },
);

it.each(["tr", "az"])("ホストの%sロケールでもIced teaをicedとICEDで検索できる", async (locale) => {
  // oxlint-disable-next-line typescript/unbound-method -- 保存したメソッドはcallで明示的なthisを渡して使う。
  const lowerCase = String.prototype.toLocaleLowerCase;
  vi.spyOn(String.prototype, "toLocaleLowerCase").mockImplementation(function (
    this: string,
    locales,
  ) {
    return lowerCase.call(this, locales ?? locale);
  });
  const value = structuredClone(catalog);
  value.configuration.products = ["Iced tea", "iced tea"].map((displayName, index) => ({
    ...structuredClone(product),
    id: `tablecast-iced-tea-${index}`,
    text: { ...product.text, ja: { ...product.text.ja, displayName } },
  }));
  const { screen } = await showMenu(value, "ja");
  for (const query of ["iced", "ICED"]) {
    await screen.getByRole("searchbox", { name: ja.menu_search }).fill(query);
    await expect.element(screen.getByText("Iced tea", { exact: true })).toBeVisible();
    await expect.element(screen.getByText("iced tea", { exact: true })).toBeVisible();
  }
});

it.each(["ja", "en"] as const)(
  "%sの商品名から同じ下書きと検索条件の詳細へ進める",
  async (locale) => {
    const { screen } = await showMenu(
      catalog,
      locale,
      "/admin/stores/tablecast-story/menu/changes/tablecast-published-draft/products?q=Tsukinagi&page=2",
      "draft",
    );
    const link = screen.getByRole("link", {
      name: resolveLocalized(product.text, locale).displayName,
      exact: true,
    });
    await expect.element(link).toBeVisible();
    const destination = new URL(link.element().getAttribute("href") ?? "", window.location.href);
    expect(destination.pathname).toBe(
      `/admin/stores/tablecast-story/menu/changes/tablecast-published-draft/products/${product.id}`,
    );
    expect(destination.searchParams.get("q")).toBe("Tsukinagi");
    expect(destination.searchParams.get("page")).toBe("2");
    expect(link.element().getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
  },
);

for (const alias of ["moon drink", "月の酒"] as const) {
  const locale = "ja";
  const labels = ja;
  it(`別名${alias}の商品一覧をカテゴリ・販売状態で検索し、詳細から戻ると同じ条件とページを保つ`, async () => {
    await page.viewport(1280, 800);
    const value = structuredClone(catalog);
    value.configuration.products = Array.from({ length: 25 }, (_, index) => ({
      ...structuredClone(product),
      id: `tablecast-product-${index}`,
      text: {
        ja: { ...product.text.ja, displayName: `日本酒 ${index}`, aliases: ["月の酒"] },
        en: {
          ...resolveLocalized(product.text, "en"),
          displayName: `Sake ${index}`,
          aliases: ["moon drink"],
        },
      },
    }));
    value.configuration.categories.push({
      id: "tablecast-other-category",
      text: {
        ja: { ...product.text.ja, displayName: "その他" },
        en: { ...resolveLocalized(product.text, "en"), displayName: "Other" },
      },
    });
    value.configuration.products.push({
      ...structuredClone(fixtureValue(value.configuration.products[0])),
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
    await search.fill(alias);
    await expect
      .element(
        screen.getByText(labels.common_result_count.replace("{count}", "26"), { exact: true }),
      )
      .toBeVisible();
    await screen.getByRole("combobox", { name: labels.editor_category, exact: true }).click();
    await page
      .getByRole("option", {
        name: resolveLocalized(fixtureValue(value.configuration.categories[0]).text, locale)
          .displayName,
        exact: true,
      })
      .click();
    await screen.getByRole("combobox", { name: labels.menu_availability }).click();
    await page.getByRole("option", { name: labels.editor_available, exact: true }).click();
    await screen.getByRole("button", { name: labels.common_next_page }).click();
    await expect.element(screen.getByText("2 / 2", { exact: true })).toBeVisible();
    const expectedSearch = router.state.location.search;
    const detailLink = screen
      .getByRole("row")
      .filter({ hasText: "日本酒 20" })
      .getByRole("link", { name: "日本酒 20", exact: true });
    detailLink.element().focus();
    await expect.element(detailLink).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect
      .element(
        screen.getByRole("heading", {
          name: "日本酒 20",
          exact: true,
        }),
      )
      .toBeVisible();
    await screen.getByRole("link", { name: labels.editor_products, exact: true }).click();
    await expect.element(screen.getByText("2 / 2", { exact: true })).toBeVisible();
    expect(router.state.location.search).toEqual(expectedSearch);
    await screen
      .getByRole("row")
      .filter({ hasText: "日本酒 20" })
      .getByRole("link", { name: "日本酒 20", exact: true })
      .click();
    router.history.back();
    await expect.element(screen.getByText("2 / 2", { exact: true })).toBeVisible();
    expect(router.state.location.search).toEqual(expectedSearch);
    await search.fill("Sake");
    await expect.element(screen.getByText("1 / 2", { exact: true })).toBeVisible();
    await screen.getByRole("combobox", { name: labels.menu_availability }).click();
    await page.getByRole("option", { name: labels.kiosk_sold_out, exact: true }).click();
    await expect
      .element(
        screen.getByText(labels.common_result_count.replace("{count}", "1"), { exact: true }),
      )
      .toBeVisible();
    for (const [width, height] of [
      [1280, 800],
      [768, 1024],
      [1024, 768],
      [728, 768],
    ] as const) {
      await page.viewport(width, height);

      await expect.poll(() => document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      await expect
        .poll(
          () =>
            screen
              .getByRole("link", { name: product.text.ja.displayName, exact: true })
              .element()
              .getBoundingClientRect().right,
        )
        .toBeLessThanOrEqual(width);
    }
    await page.viewport(1024, 768);
    await search.fill("存在しない検索");
    await expect.element(screen.getByText(labels.common_no_results, { exact: true })).toBeVisible();
    await expect
      .element(screen.getByText(labels.menu_no_items, { exact: true }))
      .not.toBeInTheDocument();
  });
}

it("価格を金額順に並べ、URLの昇降順を履歴と詳細の往復で復元する", async () => {
  const value = structuredClone(catalog);
  value.configuration.products = [900, 10000, 50].map((price) => ({
    ...structuredClone(product),
    id: `tablecast-price-${price}`,
    price,
    text: { ...product.text, ja: { ...product.text.ja, displayName: `料理 ${price}` } },
  }));
  const { screen, router } = await showMenu(
    value,
    "ja",
    "/admin/stores/tablecast-story/menu/products?sort=price%3Adesc",
  );
  const first = () => screen.getByRole("table").getByRole("row").nth(1);
  await expect
    .element(first().getByRole("link", { name: "料理 10000", exact: true }))
    .toBeVisible();
  const search = screen.getByRole("searchbox", { name: ja.menu_search });
  await expect
    .element(search)
    .toHaveAttribute("placeholder", ja.collection_search_menu_placeholder);
  await screen.getByRole("combobox", { name: ja.collection_sort, exact: true }).click();
  await page
    .getByRole("option", {
      name: `${ja.admin_unit_price} · ${ja.collection_sort_ascending}`,
      exact: true,
    })
    .click();
  await expect.element(first().getByRole("link", { name: "料理 50", exact: true })).toBeVisible();
  expect(router.state.location.search).toMatchObject({ sort: "price:asc" });
  router.history.back();
  await expect
    .element(first().getByRole("link", { name: "料理 10000", exact: true }))
    .toBeVisible();
  await first().getByRole("link", { name: "料理 10000", exact: true }).click();
  await screen.getByRole("link", { name: ja.editor_products, exact: true }).click();
  await expect
    .element(first().getByRole("link", { name: "料理 10000", exact: true }))
    .toBeVisible();
  expect(router.state.location.search).toMatchObject({ sort: "price:desc" });
  await screen.getByRole("button", { name: ja.collection_reset, exact: true }).click();
  expect(router.state.location.search).toEqual({});
  const sort = screen.getByRole("combobox", { name: ja.collection_sort, exact: true });
  await expect.element(sort).toHaveTextContent(ja.collection_sort_configured);
  await expect.element(first().getByRole("link", { name: "料理 900", exact: true })).toBeVisible();
  await search.fill("料理");
  await expect.element(sort).toHaveTextContent(ja.collection_sort_relevance);
  await sort.click();
  await page
    .getByRole("option", {
      name: `${ja.admin_unit_price} · ${ja.collection_sort_ascending}`,
      exact: true,
    })
    .click();
  await expect.element(first().getByRole("link", { name: "料理 50", exact: true })).toBeVisible();
  await sort.click();
  await page.getByRole("option", { name: ja.collection_sort_relevance, exact: true }).click();
  await expect.element(first().getByRole("link", { name: "料理 900", exact: true })).toBeVisible();
  expect(router.state.location.search.sort).toBeUndefined();
  await search.fill("");
  await expect.element(sort).toHaveTextContent(ja.collection_sort_configured);
});

vi.mock("../store/store-context", () => ({
  useStore: () => ({ id: "tablecast-story", name: "店舗", role: fixture.storeRole }),
}));
