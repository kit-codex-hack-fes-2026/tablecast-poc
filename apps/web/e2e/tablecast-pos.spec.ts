import { expect } from "@playwright/test";
import { posSettingsSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import { signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ serviceWorkers: "block" });

test("所有者のCookieでPOS設定と商品対応一覧をSSRし匿名へ漏らさない", async ({
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
  // 実際の公開済み商品から、対応一覧で名称・価格を確認できる一件を選ぶ。
  const product = settings.products.find((item) => item.available);
  if (!product) throw new Error("公開済みの商品fixtureが必要です");
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
    const productRow = ssrPage
      .getByRole("table")
      .getByRole("row")
      .filter({
        has: ssrPage.getByRole("combobox", {
          name: `${product.name.ja} · ${ja.pos_mapping_product}`,
        }),
      });
    await expect(productRow).toHaveCount(1);
    await expect(productRow).toContainText(product.name.ja);
    await expect(productRow).toContainText(new Intl.NumberFormat("ja-JP").format(product.price));

    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(path);
    await expect(page.getByRole("button", { name: "ナビゲーション", exact: true })).toBeEnabled();
    await expect(
      page.getByRole("combobox", { name: `${product.name.ja} · ${ja.pos_mapping_product}` }),
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("tablecast-pos-owner.png") });

    expect((await anonymous.request.get("/api/admin/stores/tablecast-komorebi/pos")).status()).toBe(
      401,
    );
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(path);
    await expect(anonymousPage).toHaveURL(/\/login\?/);
    await expect(
      anonymousPage.getByRole("combobox", {
        name: `${product.name.ja} · ${ja.pos_mapping_product}`,
      }),
    ).toHaveCount(0);
  } finally {
    await ownerSsr.close();
    await anonymous.close();
  }
});
