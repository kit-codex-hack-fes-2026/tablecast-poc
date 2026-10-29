import { expect } from "@playwright/test";
import { adminStateSchema, tableStateSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import { approveGuestDevice } from "./support/session";
import { test } from "./support/test";

test.use({ trace: "off", actionTimeout: 15_000, serviceWorkers: "block" });

test("初期ラーメン店へGoogleで入り、画像テーマと無料コール・有料追加を実注文する", async ({
  page,
  baseURL,
}, testInfo) => {
  const storeId = "tablecast-gomen";
  const api = `/api/admin/stores/${storeId}`;
  await page.goto(`/login?${new URLSearchParams({ returnTo: `/admin/stores/${storeId}/floor` })}`);
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await page.getByRole("button", { name: ja.auth_google, exact: true }).click();
  await page.getByRole("button", { name: /daichi.kanda@gomen.example.test/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/stores/${storeId}/floor$`));
  expect((await page.request.get("/api/admin/stores/tablecast-komorebi")).status()).toBe(403);
  const admin = adminStateSchema.parse(await (await page.request.get(api)).json());
  const table = admin.vacantTables.find((item) => item.name === "T10");
  if (!table) throw new Error("ラーメン店の空席T10がありません。");
  expect(
    (
      await page.request.post(`${api}/tables/open`, {
        data: { tableId: table.id, guestCount: 1, locale: "ja" },
      })
    ).ok(),
  ).toBe(true);
  await approveGuestDevice(page.request, page.request, {
    origin: baseURL,
    storeId,
    tableId: table.id,
  });
  await page.goto("/");
  await page.setViewportSize({ width: 1180, height: 820 });
  const banner = page.locator('[data-theme-part="banner"]');
  const artwork = banner.getByRole("img");
  await expect(artwork).toBeVisible();
  await expect(artwork).not.toHaveJSProperty("naturalWidth", 0);
  await artwork.evaluate(async (element) => {
    if (element instanceof HTMLImageElement) await element.decode();
  });
  const menu = page.locator('[data-theme-part="menu"]');
  await expect(menu).toHaveCSS("background-image", /url/);
  await menu.evaluate(async (element) => {
    const url = getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
    if (!url) throw new Error("テーマ背景がありません。");
    const image = new Image();
    image.src = url;
    await image.decode();
  });
  await expect(
    page.getByRole("button", { name: ja.kiosk_voice_resume, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: ja.kiosk_call_staff, exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tablecast-gomen-landscape.png") });
  // チラシの最初のボタンは画像上の領域で、その後にHTMLの代替リンクが並ぶ。
  await banner.getByRole("button", { name: "ラーメン 並 300g", exact: true }).first().click();
  const product = page.getByRole("region", { name: "ラーメン 並 300g", exact: true });
  await expect(product).toBeVisible();
  for (const [group, option] of [
    ["ニンニク", "マシ"],
    ["ヤサイ", "マシマシ"],
    ["アブラ", "なし"],
    ["カラメ（醤油だれ）", "普通"],
  ]) {
    await product
      .getByRole("group", { name: new RegExp(`^${group?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) })
      .getByRole("radio", { name: option, exact: true })
      .click();
  }
  await product.getByRole("checkbox", { name: /豚マシ/ }).check();
  await product.getByRole("checkbox", { name: /生卵/ }).check();
  await page.screenshot({ path: testInfo.outputPath("tablecast-gomen-product.png") });
  await product.getByRole("button", { name: ja.kiosk_add, exact: true }).click();
  await expect(product).not.toBeVisible();
  await expect(page.getByRole("dialog", { name: "ラーメン 並 300g", exact: true })).toHaveCount(0);
  const basket = tableStateSchema.parse(await (await page.request.get("/api/table")).json());
  expect(basket.cart).toMatchObject({ complete: true, total: 1200 });
  expect(basket.cart.lines[0]?.selections).toHaveLength(6);
  const cartTab = page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) });
  if ((await cartTab.getAttribute("aria-expanded")) !== "true") await cartTab.click();
  await page.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
  await expect(
    page.getByRole("region", { name: ja.kiosk_review_title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: ja.kiosk_confirm, exact: true }).click();
  await expect
    .poll(
      async () =>
        tableStateSchema.parse(await (await page.request.get("/api/table")).json()).orders.length,
    )
    .toBe(1);
  const ordered = tableStateSchema.parse(await (await page.request.get("/api/table")).json());
  expect(ordered.orders[0]?.snapshot.total).toBe(1200);
  await page.getByRole("button", { name: ja.common_close, exact: true }).click();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.screenshot({ path: testInfo.outputPath("tablecast-gomen-portrait.png") });
});
