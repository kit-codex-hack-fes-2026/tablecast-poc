import type { ReactNode } from "react";
import { resolveLocalized } from "@tablecast/api/localization";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup } from "vitest-browser-react";
import { page } from "vitest/browser";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { ImageProvider } from "../../components/image-provider";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { PosCheckout } from "./pos-checkout";
import { posCatalogOptions, posCheckoutOptions, posDevicesOptions } from "./pos-query";
import { StorePosSettings } from "./store-pos";
import { posDevicesFixture } from "./test-support/pos-fixture";
import { renderPos as render } from "./test-support/pos-render";
import { posSeedCatalog, posSeedCheckout, posSeedSettings } from "./test-support/pos-seed-fixture";

let client: QueryClient;
let viewport: { height: number; width: number };
let unexpected: string[];
beforeEach(() => {
  viewport = { height: window.innerHeight, width: window.innerWidth };
  unexpected = [];
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.unstubAllGlobals();
  await page.viewport(viewport.width, viewport.height);
  if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
});
function providers(children: ReactNode, locale: "en" | "ja") {
  return (
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <MotionProvider>
          <ImageProvider basePath="/api/table">
            <main className="h-dvh overflow-y-auto p-6">{children}</main>
          </ImageProvider>
        </MotionProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
async function capture(name: string) {
  window.scrollTo({ top: 0, behavior: "instant" });
  await new Promise(requestAnimationFrame);
  await Promise.allSettled(
    document
      .getAnimations()
      .filter(
        (animation) =>
          animation.playState === "running" &&
          Number.isFinite(animation.effect?.getComputedTiming().endTime),
      )
      .map((animation) => animation.finished),
  );
  await page.screenshot({ path: `../../../test-results/${name}.png`, fullPage: false });
}
it.each(["ja", "en"] as const)(
  "商品対応はseedの商品とカスタマイズを%sで示し、3画面幅で全体をはみ出さない",
  async (locale) => {
    const labels = locale === "ja" ? ja : en;
    await page.viewport(1180, 820);
    client.setQueryData(
      posCatalogOptions("tablecast-store", "tablecast-location").queryKey,
      posSeedCatalog,
    );
    client.setQueryData(
      posDevicesOptions("tablecast-store", "tablecast-location").queryKey,
      posDevicesFixture,
    );
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      unexpected.push(new Request(input, init).url);
      return Response.json({}, { status: 500 });
    });
    await render(
      providers(
        <StorePosSettings storeId="tablecast-store" canEdit settings={posSeedSettings} />,
        locale,
      ),
    );
    await expect
      .element(page.getByRole("heading", { name: labels.pos_title, exact: true }))
      .toBeVisible();
    const images = [...document.images].filter(
      (image) =>
        image.src.includes("/images/tablecast/") &&
        image.getBoundingClientRect().top < window.innerHeight,
    );
    expect(images.length).toBeGreaterThan(0);
    await expect
      .poll(() => images.every((image) => image.complete && image.naturalWidth > 0))
      .toBe(true);
    expect(document.querySelectorAll('article[data-theme-part="product-card"]').length).toBe(0);
    expect(page.getByRole("article").elements()).toHaveLength(posSeedSettings.products.length);
    for (const product of posSeedSettings.products) {
      const group = page.getByRole("article", {
        name: resolveLocalized(product.name, locale),
        exact: true,
      });
      await expect
        .element(
          group.getByRole("heading", { name: resolveLocalized(product.name, locale), exact: true }),
        )
        .toBeVisible();
      expect(
        group
          .getByRole("list", { name: labels.pos_mapping_customisations })
          .getByRole("listitem")
          .elements(),
      ).toHaveLength(product.options.length);
    }
    const rows = posSeedSettings.products.reduce(
      (count, product) => count + 1 + product.options.length,
      0,
    );
    await expect
      .element(
        page.getByRole("button", {
          name: new RegExp(`^${labels.pos_mapping_filter_all}\\s*${rows}$`),
        }),
      )
      .toBeVisible();
    expect(document.body.textContent).not.toMatch(/Sandbox|模擬|冪等|SDK/);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await capture(`tablecast-pos-settings-${locale}`);
    const heading = page.getByRole("heading", { name: labels.pos_mapping, exact: true });
    const search = page.getByRole("searchbox", { name: labels.pos_mapping_search });
    heading.element().scrollIntoView({ block: "start" });
    await new Promise(requestAnimationFrame);
    const product = posSeedSettings.products[0];
    if (!product) throw new Error("商品fixtureがありません");
    const entry = document.querySelector(`[data-row-id="${product.id}:product:${product.id}"]`);
    if (!entry) throw new Error("商品の親行がありません");
    expect(entry.getBoundingClientRect().height).toBeLessThan(100);
    await capture(`tablecast-pos-mapping-${locale}`);
    for (const [width, height, suffix] of [
      [402, 874, "mobile"],
      [1512, 982, "desktop"],
    ] as const) {
      await page.viewport(width, height);
      heading.element().scrollIntoView({ block: "start" });
      await new Promise(requestAnimationFrame);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
      await expect.element(search).toBeVisible();
      await capture(`tablecast-pos-mapping-${suffix}-${locale}`);
    }
  },
);

it("画像がない商品とカスタマイズも同じ階層の文字左端を揃え、子だけを字下げする", async () => {
  await page.viewport(1180, 820);
  client.setQueryData(
    posCatalogOptions("tablecast-store", "tablecast-location").queryKey,
    posSeedCatalog,
  );
  client.setQueryData(
    posDevicesOptions("tablecast-store", "tablecast-location").queryKey,
    posDevicesFixture,
  );
  const [pictured, unpictured] = posSeedSettings.products;
  const picturedOption = pictured?.options.find((option) => option.imageKey);
  const unpicturedOption = pictured?.options.find((option) => !option.imageKey);
  if (!pictured?.imageKey || !unpictured || !picturedOption || !unpicturedOption)
    throw new Error("画像あり・なしを比べるfixtureがありません");
  const settings = {
    ...posSeedSettings,
    products: [
      { ...pictured, options: [unpicturedOption, picturedOption] },
      { ...unpictured, imageKey: null, options: [] },
    ],
  };
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    unexpected.push(new Request(input, init).url);
    return Response.json({}, { status: 500 });
  });
  await render(
    providers(<StorePosSettings storeId="tablecast-store" canEdit settings={settings} />, "ja"),
  );
  const first = page.getByRole("article", { name: pictured.name.ja, exact: true });
  const productX = first
    .getByRole("heading", { name: pictured.name.ja, exact: true })
    .element()
    .getBoundingClientRect().left;
  const missingX = page
    .getByRole("article", { name: unpictured.name.ja, exact: true })
    .getByRole("heading", { name: unpictured.name.ja, exact: true })
    .element()
    .getBoundingClientRect().left;
  expect(Math.abs(productX - missingX)).toBeLessThanOrEqual(1);
  const optionX = first
    .getByText(picturedOption.name.ja, { exact: true })
    .element()
    .getBoundingClientRect().left;
  const missingOptionX = first
    .getByText(unpicturedOption.name.ja, { exact: true })
    .element()
    .getBoundingClientRect().left;
  expect(Math.abs(optionX - missingOptionX)).toBeLessThanOrEqual(1);
  expect(optionX).toBeGreaterThan(productX);
  page
    .getByRole("heading", { name: ja.pos_mapping, exact: true })
    .element()
    .scrollIntoView({ block: "start" });
  expect(
    page
      .getByRole("article", { name: unpictured.name.ja, exact: true })
      .element()
      .getBoundingClientRect().bottom,
  ).toBeLessThan(window.innerHeight);
  await capture("tablecast-pos-mapping-alignment-ja");
});

it("iPad縦の英語POS会計は必要時に既存の注文明細と合計を開く", async () => {
  await page.viewport(820, 1180);
  const data = posSeedCheckout("en");
  client.setQueryData(posCheckoutOptions("tablecast-store", "tablecast-session").queryKey, {
    ...data,
    canStart: false,
  });
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (
      new URL(request.url).pathname ===
        "/api/admin/stores/tablecast-store/tables/tablecast-session/pos/preview" &&
      request.method === "POST"
    )
      return Response.json(data);
    unexpected.push(`${request.method} ${request.url}`);
    return Response.json({}, { status: 500 });
  });
  await render(
    providers(<PosCheckout storeId="tablecast-store" sessionId="tablecast-session" />, "en"),
  );
  expect(document.querySelector("details")?.open).toBe(false);
  await page.getByRole("button", { name: en.pos_preview }).click();
  await expect.element(page.getByRole("button", { name: en.pos_start })).toBeEnabled();
  expect(document.querySelector("details")?.open).toBe(true);
  expect(document.querySelector('[data-ui="cart-lines"]')).not.toBeNull();
  expect(document.querySelector('[data-ui="bill-summary"]')).not.toBeNull();
  expect(document.body.textContent).not.toMatch(/Sandbox|simulated|Bill version/);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  await capture("tablecast-pos-checkout-en");
});
