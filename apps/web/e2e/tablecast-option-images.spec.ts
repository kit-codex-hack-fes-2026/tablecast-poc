import { expect } from "@playwright/test";
import {
  adminStateSchema,
  catalogSchema,
  configDraftSchema,
  tableStateSchema,
  uploadedImageSchema,
} from "@tablecast/api/schema";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";
import { test } from "./support/test";

test.use({ trace: "off", actionTimeout: 15_000 });

test("商品と選択肢の画像を取り込み、下書き再読込と公開後に同じ画像を確認できる", async ({
  page,
  request: staff,
  baseURL,
}, testInfo) => {
  // Given: 店長と画像付きの既存商品、未使用卓を用意する。
  const storeId = "tablecast-koharu";
  const owner = { email: credentials.otherEmail, password: credentials.otherPassword };
  const api = `/api/admin/stores/${storeId}`;
  const headers = { Origin: baseURL ?? "" };
  expect((await staff.post("/api/auth/sign-in/email", { headers, data: owner })).status()).toBe(
    200,
  );
  expect(
    (await page.request.post("/api/auth/sign-in/email", { headers, data: owner })).status(),
  ).toBe(200);
  const original = catalogSchema.parse(await (await staff.get(`${api}/catalog`)).json());
  const product = original.configuration.products.find(
    (item) => item.id === `${storeId}-westward-classic`,
  );
  if (!product) throw new Error("画像付きのカスタムバーガーが必要です。");
  const picturedModifier = product.modifiers[0];
  const option = picturedModifier.options.find((item) => item.available && item.imageKey);
  if (!option?.imageKey) throw new Error("実画像を持つ選択肢が必要です。");
  const description = "バンズの形と色をイメージ画像で確認できます。";
  const draft = configDraftSchema.parse(
    await (await staff.post(`${api}/drafts`, { headers, data: {} })).json(),
  );
  const menu = `/admin/stores/${storeId}/menu/changes/${draft.id}`;
  await page.goto(`${menu}/products/${product.id}`);
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  // When: 解除と既存参照指定を保存し、続いて実取込APIから商品・選択肢を置換する
  const optionGroup = page.getByRole("group", {
    name: `グループ 1：${picturedModifier.text.ja.displayName} 選択肢 ${picturedModifier.options.indexOf(option) + 1}：${option.text.ja.displayName}`,
    exact: true,
  });
  const optionImage = optionGroup.getByRole("group", {
    name: ja.editor_image_settings,
    exact: true,
  });
  await optionGroup.getByText(ja.editor_option_details, { exact: true }).click();
  await optionImage.getByRole("button", { name: ja.editor_image_remove }).click();
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  await page.reload();
  await optionGroup.getByText(ja.editor_option_details, { exact: true }).click();
  await expect(optionImage.getByText(ja.editor_image_empty, { exact: true })).toBeVisible();
  await optionImage
    .getByRole("combobox", { name: ja.editor_image_method })
    .selectOption("existing");
  await optionImage
    .getByRole("textbox", { name: ja.editor_image, exact: true })
    .fill(option.imageKey);
  await optionImage.getByRole("button", { name: ja.editor_image_apply }).click();
  await optionGroup
    .getByRole("textbox", { name: new RegExp(`${ja.common_ja} ${ja.admin_description}$`) })
    .fill(description);
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  await page.reload();
  await optionGroup.getByText(ja.editor_option_details, { exact: true }).click();
  await expect(optionImage.locator("img")).toHaveAttribute("src", new RegExp(option.imageKey));
  const uploadedKeys: string[] = [];
  for (const [index, target] of [product, option].entries()) {
    if (!target.imageKey) throw new Error("取込元の画像が必要です");
    const imageField =
      index === 0
        ? page.getByRole("group", { name: ja.editor_image_settings, exact: true }).first()
        : optionImage;
    const imageFile = await staff.get(`/media/${target.imageKey}`);
    expect(imageFile.status()).toBe(200);
    await imageField.getByLabel(ja.editor_image_replace).setInputFiles({
      name: "tablecast-menu.webp",
      mimeType: "image/webp",
      buffer: await imageFile.body(),
    });
    await imageField.getByRole("checkbox", { name: ja.editor_generated_image }).check();
    await imageField
      .getByRole("textbox", { name: ja.editor_image_source, exact: true })
      .fill("店舗が利用を許可した生成メニュー画像");
    await expect(imageField.getByRole("img", { name: ja.editor_image_candidate })).toBeVisible();
    const uploadFinished = page.waitForResponse(
      (response) =>
        response.url().endsWith(`${api}/images`) && response.request().method() === "POST",
    );
    await imageField.getByRole("button", { name: ja.editor_image_upload }).click();
    const uploadResponse = await uploadFinished;
    expect(uploadResponse.status()).toBe(200);
    const uploaded = uploadedImageSchema.parse(await uploadResponse.json());
    uploadedKeys.push(uploaded.imageKey);
    await expect(
      imageField.getByRole("status").filter({ hasText: ja.editor_image_uploaded }),
    ).toBeVisible();
    await expect(imageField.getByRole("img", { name: ja.editor_image_current })).toHaveAttribute(
      "src",
      new RegExp(uploaded.imageKey),
    );
  }
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  await page.reload();
  await optionGroup.getByText(ja.editor_option_details, { exact: true }).click();
  await expect(optionImage.locator("img")).toHaveAttribute("src", new RegExp(uploadedKeys[1]));
  const image = optionImage.locator("img");
  await expect
    .poll(() =>
      image.evaluate(
        (element) =>
          element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await page.setViewportSize({ width: 768, height: 1024 });
  await optionImage.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await optionImage.screenshot({ path: testInfo.outputPath("tablecast-image-ja-portrait.png") });
  await page.getByRole("button", { name: "English", exact: true }).click();
  const englishImage = page
    .getByRole("group", { name: en.editor_image_settings, exact: true })
    .first();
  await page.setViewportSize({ width: 1024, height: 768 });
  await englishImage.screenshot({ path: testInfo.outputPath("tablecast-image-en-landscape.png") });
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await page.getByRole("link", { name: ja.admin_drafts, exact: true }).click();
  await page.getByRole("button", { name: ja.admin_validate, exact: true }).click();
  await expect(page.getByRole("button", { name: ja.admin_publish, exact: true })).toBeEnabled();
  expect(catalogSchema.parse(await (await staff.get(`${api}/catalog`)).json())).toEqual(original);
  await page.getByRole("button", { name: ja.admin_publish, exact: true }).click();
  await expect(page.getByRole("button", { name: ja.admin_publish, exact: true })).toHaveCount(0);
  const published = catalogSchema.parse(await (await staff.get(`${api}/catalog`)).json());
  expect(published.configuration.products.find((item) => item.id === product.id)).toMatchObject({
    imageKey: uploadedKeys[0],
    imageKind: "illustration",
    imageSource: { generated: true, description: "店舗が利用を許可した生成メニュー画像" },
  });
  expect(
    published.configuration.products
      .find((item) => item.id === product.id)
      ?.modifiers[0].options.find((item) => item.id === option.id),
  ).toMatchObject({
    imageKey: uploadedKeys[1],
    imageKind: "illustration",
    text: { ja: { description } },
  });
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
    name: picturedModifier.text.ja.displayName,
    exact: true,
  });
  const guestImage = group.locator("img").first();
  await expect(guestImage).toBeVisible();
  await expect
    .poll(() =>
      guestImage.evaluate(
        (element) =>
          element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await expect(group.getByText(ja.kiosk_illustration, { exact: true }).first()).toBeVisible();
  await expect(group.getByText(description, { exact: true })).toBeVisible();
  for (const modifier of product.modifiers) {
    const choice = modifier.options.find((item) => item.available);
    if (!choice) throw new Error("選択可能なオプションが必要です。");
    if (modifier.kind === "quantity") {
      await productPage
        .getByRole("button", {
          name: `${choice.text.ja.displayName}: ${ja.common_increase}`,
          exact: true,
        })
        .click();
    } else {
      await productPage
        .getByRole(modifier.kind === "single" ? "radio" : "checkbox", {
          name: choice.text.ja.displayName,
          exact: true,
        })
        .check();
    }
  }
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
  expect(table.cart.total).toBe(1530);
});
