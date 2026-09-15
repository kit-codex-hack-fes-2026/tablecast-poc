import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { test } from "./support/test";
import { catalogSchema, configDraftSchema, uploadedImageSchema } from "@tablecast/api/schema";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };

test("店舗ロゴとチラシを持つ下書きのテーマを編集し実際の注文画面で確認する", async ({
  page,
  baseURL,
}, testInfo) => {
  const headers = { Origin: baseURL ?? "" };
  expect(
    (await page.request.post("/api/auth/sign-in/email", { headers, data: credentials })).ok(),
  ).toBe(true);
  const storeId = "tablecast-hanul";
  const endpoint = `/api/admin/stores/${storeId}`;
  const original = catalogSchema.parse(
    await (await page.request.get(`${endpoint}/catalog`)).json(),
  );
  const products = original.configuration.products
    .filter((product) => product.available)
    .slice(0, 2);
  if (products.length < 2) throw new Error("商品が二つ必要です");
  const png = await readFile(new URL("../public/brand/tablecast-logo.png", import.meta.url));
  const upload = await page.request.post(`${endpoint}/images`, {
    headers,
    multipart: {
      image: { name: "tablecast-logo.png", mimeType: "image/png", buffer: png },
      metadata: JSON.stringify({
        imageKind: "illustration",
        imageSource: { generated: false, description: "試験用画像" },
      }),
    },
  });
  expect(upload.ok()).toBe(true);
  const { url: _url, ...asset } = uploadedImageSchema.parse(await upload.json());
  const image = { ...asset, alt: { ja: "店舗のマーク", en: "Store mark" } };
  const draft = configDraftSchema.parse(
    await (await page.request.post(`${endpoint}/drafts`, { headers, data: {} })).json(),
  );
  const prepared = await page.request.put(`${endpoint}/drafts/${draft.id}`, {
    headers,
    data: {
      expectedVersion: draft.version,
      configuration: {
        ...draft.configuration,
        branding: { logo: image },
        banners: [
          {
            id: "flyer",
            image,
            enabled: true,
            hotspots: products.map((product, index) => ({
              id: `region-${index}`,
              productId: product.id,
              rect: { x: index / 2, y: 0, width: 0.5, height: 1 },
            })),
          },
        ],
      },
    },
  });
  expect(prepared.ok()).toBe(true);
  await page.goto(`/admin/stores/${storeId}/design?draftId=${draft.id}`);
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await page.getByRole("button", { name: ja.theme_ramen_preset }).click();
  await page
    .getByRole("textbox", { name: ja.theme_css, exact: true })
    .fill('[data-theme-part="category-button"] { border-style:double; border-width:3px; }');
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: ja.theme_css, exact: true })).toHaveValue(
    /border-style:double/,
  );
  const current = configDraftSchema.parse(
    await (await page.request.get(`${endpoint}/drafts/${draft.id}`)).json(),
  );
  expect(
    (
      await page.request.put(`${endpoint}/drafts/${draft.id}`, {
        headers,
        data: {
          expectedVersion: current.version,
          configuration: current.configuration,
        },
      })
    ).ok(),
  ).toBe(true);
  const localCss = '[data-theme-part="product-card"] { border-width:4px; }';
  await page.getByRole("textbox", { name: ja.theme_css, exact: true }).fill(localCss);
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(ja.common_conflict);
  await expect(page.getByRole("textbox", { name: ja.theme_css, exact: true })).toHaveValue(
    localCss,
  );
  await page.getByRole("button", { name: ja.workflow_conflict_reload, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: ja.workflow_conflict_reload, exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: ja.theme_css, exact: true })).toHaveValue(
    /border-style:double/,
  );
  expect(
    catalogSchema.parse(await (await page.request.get(`${endpoint}/catalog`)).json()).configuration,
  ).toEqual(original.configuration);
  await page.screenshot({
    path: testInfo.outputPath("tablecast-theme-editor.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: ja.theme_preview }).click();
  await expect(page).toHaveURL(/\/demo\?demoId=/);
  const kiosk = page.frameLocator("iframe");
  await expect(kiosk.getByRole("img", { name: image.alt.ja })).toHaveCount(2);
  await expect(kiosk.getByRole("button", { name: ja.kiosk_call_staff })).toBeVisible();
  const first = products[0];
  if (!first) throw new Error("商品が必要です");
  await kiosk.getByRole("button", { name: first.text.ja.displayName, exact: true }).first().click();
  await expect(
    kiosk.getByRole("heading", { name: first.text.ja.displayName, exact: true }),
  ).toBeVisible();
  const productImage = kiosk.getByRole("img", { name: first.text.ja.displayName, exact: true });
  await expect(productImage).toBeInViewport();
  await expect
    .poll(() => productImage.evaluate((element: HTMLImageElement) => element.naturalWidth))
    .toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath("tablecast-theme-product.png"),
    fullPage: true,
  });
  await kiosk.getByRole("button", { name: ja.kiosk_menu, exact: true }).click();
  await page.getByRole("button", { name: ja.demo_rotate, exact: true }).click();
  await kiosk.getByRole("button", { name: "English", exact: true }).click();
  const second = products[1];
  if (!second) throw new Error("二つ目の商品が必要です");
  const flyer = kiosk.getByRole("img", { name: image.alt.en }).last();
  const region = kiosk
    .getByRole("button", { name: second.text.en.displayName, exact: true })
    .first();
  await expect(flyer).toBeVisible();
  await expect(region).toBeVisible();
  const pictureBounds = await flyer.boundingBox();
  const regionBounds = await region.boundingBox();
  if (!pictureBounds || !regionBounds) throw new Error("チラシと商品領域が必要です");
  expect((regionBounds.x - pictureBounds.x) / pictureBounds.width).toBeCloseTo(0.5, 2);
  expect(regionBounds.width / pictureBounds.width).toBeCloseTo(0.5, 2);
  await page.screenshot({
    path: testInfo.outputPath("tablecast-theme-portrait-en.png"),
    fullPage: true,
  });
  await region.click();
  await expect(
    kiosk.getByRole("heading", { name: second.text.en.displayName, exact: true }),
  ).toBeVisible();
});
