import { expect } from "@playwright/test";
import {
  adminStateSchema,
  catalogSchema,
  configDraftSchema,
  tableStateSchema,
} from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";
import { test } from "./support/test";

test.use({ trace: "off", actionTimeout: 15_000 });

test("選択肢の画像を下書きで設定し、公開承認後に客が写真を見て選べる", async ({
  page,
  request: staff,
  baseURL,
}, testInfo) => {
  // Given: 店長と画像付きの既存商品、未使用卓を用意する。
  const storeId = "tablecast-komorebi";
  const api = `/api/admin/stores/${storeId}`;
  const headers = { Origin: baseURL ?? "" };
  expect(
    (await staff.post("/api/auth/sign-in/email", { headers, data: credentials })).status(),
  ).toBe(200);
  expect(
    (await page.request.post("/api/auth/sign-in/email", { headers, data: credentials })).status(),
  ).toBe(200);
  const original = catalogSchema.parse(await (await staff.get(`${api}/catalog`)).json());
  const product = original.configuration.products.find(
    (item) =>
      item.available &&
      item.imageKey &&
      item.modifiers.length > 0 &&
      item.modifiers.every(
        (group) => group.kind === "single" && group.options.some((option) => option.available),
      ),
  );
  if (!product?.imageKey) throw new Error("画像と単一選択肢を持つ商品が必要です。");
  const option = product.modifiers[0].options.find((item) => item.available);
  if (!option) throw new Error("選択可能なオプションが必要です。");
  const draft = configDraftSchema.parse(
    await (await staff.post(`${api}/drafts`, { headers, data: {} })).json(),
  );
  const menu = `/admin/stores/${storeId}/menu/changes/${draft.id}`;
  await page.goto(`${menu}/products/${product.id}`);
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  // When: 商品と同じ R2 参照を選択肢へ設定し、保存後に編集 URL を再読み込みする。
  const optionGroup = page.getByRole("group", { name: option.text.ja.displayName, exact: true });
  await optionGroup
    .getByRole("textbox", { name: ja.editor_image, exact: true })
    .fill(product.imageKey);
  await optionGroup
    .getByRole("combobox", { name: ja.editor_image_kind, exact: true })
    .selectOption("illustration");
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  await page.reload();
  await expect(
    optionGroup.getByRole("textbox", { name: ja.editor_image, exact: true }),
  ).toHaveValue(product.imageKey);
  const image = optionGroup.locator("img");
  await expect(image).toBeVisible();
  await expect
    .poll(() =>
      image.evaluate(
        (element) =>
          element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await image.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await page.screenshot({ path: testInfo.outputPath("tablecast-option-image-editor.png") });
  await page.getByRole("link", { name: ja.admin_drafts, exact: true }).click();
  await page.getByRole("button", { name: ja.admin_validate, exact: true }).click();
  await expect(page.getByRole("button", { name: ja.admin_publish, exact: true })).toBeEnabled();
  expect(catalogSchema.parse(await (await staff.get(`${api}/catalog`)).json())).toEqual(original);
  await page.getByRole("button", { name: ja.admin_publish, exact: true }).click();
  await expect(page.getByRole("button", { name: ja.admin_publish, exact: true })).toHaveCount(0);
  const published = catalogSchema.parse(await (await staff.get(`${api}/catalog`)).json());
  expect(
    published.configuration.products
      .find((item) => item.id === product.id)
      ?.modifiers[0].options.find((item) => item.id === option.id)?.imageKey,
  ).toBe(product.imageKey);
  // Then: 同じ公開版を新しい卓で読み、実画像の表示とカートへ保存した選択を確認する。
  const state = adminStateSchema.parse(await (await staff.get(api)).json());
  const vacant = state.vacantTables[0];
  if (!vacant) throw new Error("試験用の空卓が必要です。");
  expect(
    (
      await staff.post(`${api}/tables/open`, {
        headers,
        data: { tableId: vacant.id, guestCount: 2, locale: "ja" },
      })
    ).status(),
  ).toBe(200);
  await page.goto("/");
  await page.getByRole("button", { name: ja.pair_begin, exact: true }).click();
  const userCode = await page.getByLabel(ja.admin_pair_code).textContent();
  expect(
    (
      await staff.post(`${api}/devices/approve`, {
        headers,
        data: { userCode, tableId: vacant.id },
      })
    ).status(),
  ).toBe(200);
  await expect(page.getByRole("banner").getByText(vacant.name, { exact: true })).toBeVisible();
  await page
    .getByRole("button")
    .filter({ has: page.getByText(product.text.ja.displayName, { exact: true }) })
    .click();
  const productPage = page.getByRole("region", { name: product.text.ja.displayName, exact: true });
  const group = productPage.getByRole("radiogroup", {
    name: product.modifiers[0].text.ja.displayName,
    exact: true,
  });
  const guestImage = group.locator("img");
  await expect(guestImage).toBeVisible();
  await expect
    .poll(() =>
      guestImage.evaluate(
        (element) =>
          element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await expect(group.getByText(ja.kiosk_illustration, { exact: true })).toBeVisible();
  for (const modifier of product.modifiers) {
    const choice = modifier.options.find((item) => item.available);
    if (!choice) throw new Error("選択可能なオプションが必要です。");
    await productPage.getByRole("radio", { name: choice.text.ja.displayName, exact: true }).check();
  }
  await group.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await group.screenshot({ path: testInfo.outputPath("tablecast-option-image-guest.png") });
  await productPage.getByRole("button", { name: ja.kiosk_add, exact: true }).click();
  await expect(productPage).toHaveCount(0);
  const table = tableStateSchema.parse(await (await page.request.get("/api/table")).json());
  expect(table.cart.lines).toEqual([
    expect.objectContaining({
      productId: product.id,
      quantity: 1,
      selections: product.modifiers.map((modifier) => ({
        optionId: modifier.options.find((item) => item.available)?.id,
        quantity: 1,
      })),
    }),
  ]);
  expect(table.cart.complete).toBe(true);
});
