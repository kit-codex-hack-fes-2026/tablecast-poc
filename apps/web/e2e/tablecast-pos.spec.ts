import { expect } from "@playwright/test";
import { posSettingsSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import { signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ serviceWorkers: "block" });

test("所有者のCookieでPOS設定と共通商品表示をSSRし匿名へ漏らさない", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  await signInStaff(page.request, baseURL);
  const path = "/admin/stores/tablecast-komorebi/pos";
  const settingsResponse = await page.request.get("/api/admin/stores/tablecast-komorebi/pos");
  expect(settingsResponse.status()).toBe(200);
  const settings = posSettingsSchema.parse(await settingsResponse.json());
  expect(settings.configured).toBe(false);
  expect(settings.connection).toBeNull();
  // 実際の公開済み商品から、共通カードに写真・名称・価格を表示できる一件を選ぶ。
  const product = settings.products.find((item) => item.available && item.imageKey);
  if (!product?.imageKey) throw new Error("画像付きの公開商品fixtureが必要です");
  const ownerSsr = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    serviceWorkers: "block",
    storageState: await page.context().storageState(),
  });
  const anonymous = await browser.newContext({
    baseURL,
    javaScriptEnabled: false,
    serviceWorkers: "block",
  });
  try {
    const ssrPage = await ownerSsr.newPage();
    const response = await ssrPage.goto(path);
    expect(response?.status()).toBe(200);
    expect(response?.headers()["cache-control"]).toBe("private, no-store");
    await expect(ssrPage.getByRole("heading", { name: ja.pos_title, exact: true })).toBeVisible();
    await expect(ssrPage.getByRole("button", { name: ja.pos_connect, exact: true })).toBeDisabled();
    const productCard = ssrPage.getByRole("article").filter({
      has: ssrPage.getByRole("heading", { name: product.name.ja, exact: true }),
    });
    await expect(productCard).toHaveCount(1);
    await expect(productCard).toHaveCSS("display", "flex");
    await expect(productCard).toContainText(new Intl.NumberFormat("ja-JP").format(product.price));
    await expect(productCard.locator(`img[src*="${product.imageKey}"]`)).toHaveCount(1);

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(path);
    await expect(page.getByRole("button", { name: "ナビゲーション", exact: true })).toBeEnabled();
    await expect(page.getByRole("heading", { name: product.name.ja, exact: true })).toBeVisible();
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("tablecast-pos-owner.png") });

    expect((await anonymous.request.get("/api/admin/stores/tablecast-komorebi/pos")).status()).toBe(
      401,
    );
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(path);
    await expect(anonymousPage).toHaveURL(/\/login\?/);
    await expect(
      anonymousPage.getByRole("heading", { name: product.name.ja, exact: true }),
    ).toHaveCount(0);
  } finally {
    await ownerSsr.close();
    await anonymous.close();
  }
});
