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
}) => {
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
  // When: 下書きから画像を外して保存し、実際のバンズ写真と説明を再設定する。
  const optionGroup = page.getByRole("group", { name: option.text.ja.displayName, exact: true });
  const imageField = optionGroup.getByRole("textbox", { name: ja.editor_image, exact: true });
  await imageField.fill("");
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  await page.reload();
  await expect(imageField).toHaveValue("");
  await expect(optionGroup.locator("img")).toHaveCount(0);
  await imageField.fill(option.imageKey);
  await optionGroup
    .getByRole("group", { name: ja.common_ja, exact: true })
    .getByRole("textbox", { name: ja.admin_description, exact: true })
    .fill(description);
  await optionGroup
    .getByRole("combobox", { name: ja.editor_image_kind, exact: true })
    .selectOption("illustration");
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  await page.reload();
  await expect(
    optionGroup.getByRole("textbox", { name: ja.editor_image, exact: true }),
  ).toHaveValue(option.imageKey);
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
      ?.modifiers[0].options.find((item) => item.id === option.id),
  ).toMatchObject({ imageKey: option.imageKey, text: { ja: { description } } });
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
