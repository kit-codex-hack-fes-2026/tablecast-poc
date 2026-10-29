import { expect } from "@playwright/test";
import { catalogSchema, coreStateSchema } from "@tablecast/api/schema";
import { z } from "zod";
import ja from "../messages/ja.json" with { type: "json" };
import { signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ serviceWorkers: "block" });

test("検索と商品詳細を往復して再読込し、外部からの共有検索条件を実通知で同じ順序へ反映する", async ({
  page,
  baseURL,
}, testInfo) => {
  const storeId = "tablecast-komorebi";
  await signInStaff(page.request, baseURL);
  const created = await page.request.post(`/api/admin/stores/${storeId}/demo`, {
    headers: { Origin: baseURL ?? "" },
  });
  expect(created.status()).toBe(200);
  const { id } = z.object({ id: z.string() }).parse(await created.json());
  const endpoint = `/api/admin/stores/${storeId}/demo/${id}/table`;
  const catalog = catalogSchema.parse(await (await page.request.get(`${endpoint}/catalog`)).json());
  const captureMenu = async (viewport: { height: number; width: number }, name: string) => {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.locator('[data-theme-part="product-card"] img').evaluateAll((images) =>
          images
            .filter((image) => {
              const rect = image.getBoundingClientRect();
              return rect.top < window.innerHeight && rect.bottom > 0;
            })
            .every(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
            ),
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(
        `tablecast-menu-search-${name}-${viewport.width}x${viewport.height}.png`,
      ),
    });
  };
  await page.goto(`/admin/stores/${storeId}/demo/${id}`);
  await page.getByRole("button", { name: ja.kiosk_menu_search, exact: true }).click();
  const input = page.getByRole("searchbox", { name: ja.kiosk_menu_search_label });
  await expect(input).toBeFocused();
  for (const viewport of [
    { width: 1180, height: 820 },
    { width: 402, height: 874 },
  ])
    await captureMenu(viewport, "empty");
  await page.setViewportSize({ width: 1180, height: 820 });
  const first = catalog.configuration.products.find((product) => product.available);
  if (!first) throw new Error("販売中の商品fixtureが必要です");
  await input.fill(first.text.ja.displayName);
  await expect
    .poll(
      async () =>
        coreStateSchema.parse(await (await page.request.get(`${endpoint}?view=core`)).json())
          .menuSearch?.query,
    )
    .toBe(first.text.ja.displayName);
  await expect(
    page.getByRole("button", { name: new RegExp(first.text.ja.displayName) }),
  ).toBeVisible();
  await page.getByRole("button", { name: new RegExp(first.text.ja.displayName) }).click();
  const detail = page.getByRole("dialog", { name: first.text.ja.displayName, exact: true });
  await expect(detail).toBeVisible();
  await detail.getByRole("button", { name: ja.common_close, exact: true }).click();
  await expect(input).toHaveValue(first.text.ja.displayName);
  await page.reload();
  await expect(input).toHaveValue(first.text.ja.displayName);
  await expect(input).not.toBeFocused();
  // 音声ツールと同じ共有操作を別の要求から実行し、実WebSocket→状態取得→描画を確認する。
  const changed = await page.request.patch(`${endpoint}/ui?view=core`, {
    data: { section: "menu", search: { query: "こもれび", offset: 8 } },
  });
  expect(changed.status()).toBe(200);
  const state = coreStateSchema.parse(await changed.json());
  expect(state.menuSearch?.offset).toBe(8);
  await expect(input).toHaveValue("こもれび");
  const expected =
    state.menuSearch?.productIds.map((productId) => {
      const item = catalog.configuration.products.find((product) => product.id === productId);
      if (!item) throw new Error("検索結果の商品がありません");
      return item.text.ja.displayName;
    }) ?? [];
  await expect(page.locator('[data-theme-part="product-card"] strong')).toHaveText(expected);
  for (const viewport of [
    { width: 1180, height: 820 },
    { width: 820, height: 1180 },
    { width: 402, height: 874 },
    { width: 1512, height: 982 },
  ]) {
    await captureMenu(viewport, "results");
  }
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.getByRole("button", { name: ja.common_back, exact: true }).click();
  await expect(page.getByRole("button", { name: ja.kiosk_menu_search, exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("tablecast-menu-search-button-1180x820.png") });
});
