import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
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
it("商品対応はseedの商品とカスタマイズを小さな一覧で示し、iPad・携帯・デスクトップで全体をはみ出さない", async () => {
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
      "ja",
    ),
  );
  await expect
    .element(page.getByRole("heading", { name: ja.pos_title, exact: true }))
    .toBeVisible();
  const images = [...document.images].filter(
    (image) =>
      image.src.includes("/images/tablecast/") &&
      image.getBoundingClientRect().top < window.innerHeight,
  );
  expect(images.length).toBeGreaterThan(0);
  await Promise.all(images.map((image) => image.decode()));
  expect(images.every((image) => image.naturalWidth > 0)).toBe(true);
  expect(document.querySelectorAll('article[data-theme-part="product-card"]').length).toBe(0);
  const table = page.getByRole("table");
  await expect.element(table.getByRole("columnheader", { name: "TableCast" })).toBeVisible();
  await expect.element(table.getByRole("columnheader", { name: "Square" })).toBeVisible();
  await expect
    .element(table.getByRole("columnheader", { name: ja.pos_mapping_status }))
    .toBeVisible();
  const rows = posSeedSettings.products.reduce(
    (count, product) => count + 1 + product.options.length,
    0,
  );
  expect(table.getByRole("row").elements()).toHaveLength(Math.min(rows, 20) + 1);
  await expect
    .element(
      page.getByRole("button", { name: new RegExp(`^${ja.pos_mapping_filter_all}\\s*${rows}$`) }),
    )
    .toBeVisible();
  expect(document.body.textContent).not.toMatch(/Sandbox|模擬|冪等|SDK/);
  expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  await capture("tablecast-pos-settings-ja");
  const heading = page.getByRole("heading", { name: ja.pos_mapping, exact: true });
  const search = page.getByRole("searchbox", { name: ja.pos_mapping_search });
  heading.element().scrollIntoView({ block: "start" });
  await new Promise(requestAnimationFrame);
  expect(table.getByRole("row").nth(1).element().getBoundingClientRect().height).toBeLessThan(100);
  await capture("tablecast-pos-mapping-ja");
  for (const [width, height, suffix] of [
    [402, 874, "mobile"],
    [1512, 982, "desktop"],
  ] as const) {
    await page.viewport(width, height);
    heading.element().scrollIntoView({ block: "start" });
    await new Promise(requestAnimationFrame);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);
    await expect.element(search).toBeVisible();
    await capture(`tablecast-pos-mapping-${suffix}-ja`);
  }
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
