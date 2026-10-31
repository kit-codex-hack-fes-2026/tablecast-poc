import { expect } from "@playwright/test";
import { configDraftSchema, tableStateSchema } from "@tablecast/api/schema";
import { z } from "zod";
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";
import { signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ trace: "off", serviceWorkers: "block" });

test("seedの具材変更をAPIで合算して注文へ固定し、管理画面でも調理条件を保存する", async ({
  page,
  baseURL,
}, testInfo) => {
  const storeId = "tablecast-koharu";
  const api = `/api/admin/stores/${storeId}`;
  const headers = { Origin: baseURL ?? "" };
  await signInStaff(page.request, baseURL, credentials.otherEmail);
  const created = await page.request.post(`${api}/demo`, { headers });
  expect(created.status()).toBe(200);
  const { id } = z.object({ id: z.string() }).parse(await created.json());
  const endpoint = `${api}/demo/${id}/table`;
  await page.request.patch(`${endpoint}/locale`, { data: { locale: "ja" } });
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto(`${api.replace("/api", "")}/demo/${id}`);
  await page
    .getByRole("button")
    .filter({ has: page.getByText("ウエストワード・カスタムバーガー", { exact: true }) })
    .click();
  const detail = page.getByRole("dialog", {
    name: "ウエストワード・カスタムバーガー",
    exact: true,
  });
  await expect(detail).toBeVisible();
  for (const name of ["ブリオッシュ", "ビーフ", "チーズなし", "マスタード"])
    await detail.getByRole("radio", { name: new RegExp(`^${name}`) }).check();
  const information = detail.getByRole("region", { name: ja.food_title, exact: true });
  const bun = detail
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: /^ブリオッシュ/ }) });
  await expect(bun.getByLabel("乳: 含有", { exact: true })).toBeVisible();
  await expect(bun.getByLabel("小麦: 含有", { exact: true })).toBeVisible();
  await expect(bun.getByRole("radio", { name: /^ブリオッシュ/ })).toHaveAccessibleDescription(
    /追加する具材のアレルギー.*乳/,
  );
  await expect(bun.getByLabel("乳: 含有", { exact: true })).toHaveAttribute(
    "data-variant",
    "inactive",
  );
  await expect(information.getByText(ja.food_selection_complete, { exact: true })).toBeVisible();
  await expect(information.getByLabel("乳: 含有", { exact: true })).toBeVisible();
  await expect(information.getByText("マスタード", { exact: false })).toHaveCount(0);
  await detail.getByRole("radio", { name: /^レタス包み/ }).check();
  await detail.getByRole("radio", { name: /^植物由来パティ/ }).check();
  await expect(information.getByText(ja.food_selection_complete, { exact: true })).toBeVisible();
  await expect(information.getByLabel("乳: 含有", { exact: true })).toHaveCount(0);
  await expect(information.getByLabel("乳: 不使用", { exact: true })).toHaveCount(0);
  await expect(information.getByText(ja.food_allergens, { exact: true })).toBeVisible();
  await expect(information.getByText(ja.food_dietary, { exact: true })).toBeVisible();
  await expect(
    information.getByLabel(`${ja.food_vegan}: ${ja.food_yes}`, { exact: true }),
  ).toBeVisible();
  await expect(
    information.getByLabel(`${ja.editor_cross_contact}: ${ja.editor_possible}`, { exact: true }),
  ).toBeVisible();
  for (const viewport of [
    { width: 1180, height: 820 },
    { width: 402, height: 874 },
    { width: 1512, height: 982 },
  ]) {
    await page.setViewportSize(viewport);
    await detail.getByRole("heading", { level: 2 }).focus();
    await detail
      .locator('[data-ui="product-detail-body"]')
      .evaluate((element) => (element.scrollTop = 0));
    await expect(information.locator("details,summary,[data-slot=accordion]")).toHaveCount(0);
    for (const name of [ja.food_allergens, ja.food_dietary])
      expect(
        await information
          .getByRole("list", { name, exact: true })
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
    await expect(information.getByText(ja.food_current_selection, { exact: true })).toBeVisible();
    const firstOption = detail.getByRole("radio", { name: /^ブリオッシュ/ });
    await expect(firstOption).toBeInViewport();
    const nameBox = await detail.getByRole("heading", { level: 2 }).boundingBox();
    const priceBox = await detail.locator('[data-ui="product-detail-price"]').boundingBox();
    const informationBox = await information.boundingBox();
    expect(nameBox && priceBox && informationBox).toBeTruthy();
    if (!nameBox || !priceBox || !informationBox)
      throw new Error("商品見出しの寸法を取得できません");
    expect(informationBox.y - priceBox.y - priceBox.height).toBeGreaterThan(
      priceBox.y - nameBox.y - nameBox.height,
    );
    const header = detail.locator('[data-ui="product-detail-header"]');
    await expect(header.getByRole("region", { name: ja.food_title })).toBeVisible();
    const images = detail.locator("img");
    await expect
      .poll(() =>
        images.evaluateAll((items) =>
          items.every(
            (image) =>
              image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`tablecast-food-${viewport.width}x${viewport.height}.png`),
    });
  }
  await page.setViewportSize({ width: 1180, height: 820 });
  const lettuce = detail
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: /^レタス包み/ }) });
  const lettuceName = await lettuce.getByText("レタス包み", { exact: true }).boundingBox();
  const lettuceControl = await lettuce.getByRole("radio", { name: /^レタス包み/ }).boundingBox();
  if (!lettuceName || !lettuceControl) throw new Error("選択肢の寸法を取得できません");
  expect(
    Math.abs(lettuceName.y + lettuceName.height / 2 - lettuceControl.y - lettuceControl.height / 2),
  ).toBeLessThan(1);
  await expect(lettuce.getByRole("list")).toHaveCount(0);
  await information
    .getByRole("button", { name: `${ja.food_halal}: ${ja.food_yes}`, exact: true })
    .click();
  const foodPopover = page.getByRole("dialog", {
    name: ja.food_halal,
    exact: true,
  });
  await expect(
    foodPopover.getByText(ja.food_not_certified, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(foodPopover).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("tablecast-food-halal-1180x820.png") });
  await foodPopover.getByRole("button", { name: ja.common_close, exact: true }).click();
  await detail.getByRole("button", { name: ja.kiosk_add, exact: true }).click();
  await page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }).click();
  await page.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
  await page.getByRole("button", { name: ja.kiosk_confirm, exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: ja.kiosk_ordered_items.replace("{count}", "1"), exact: true }),
  ).toBeVisible();
  const state = tableStateSchema.parse(await (await page.request.get(endpoint)).json());
  expect(state.orders[0]?.snapshot.lines[0]?.foodInformation).toMatchObject({
    allergens: { milk: "not_used", egg: "not_used", wheat: "not_used", soya: "contains" },
    dietary: {
      vegan: { status: "yes" },
      halal: { status: "yes" },
      glutenFree: { status: "yes" },
    },
    crossContact: "possible",
  });
  const draft = configDraftSchema.parse(
    await (await page.request.post(`${api}/drafts`, { headers })).json(),
  );
  const productId = "tablecast-koharu-westward-classic";
  await page.goto(`/admin/stores/${storeId}/menu/changes/${draft.id}/products/${productId}`);
  await page.getByText(ja.food_base, { exact: true }).click();
  await page
    .getByRole("combobox", { name: ja.editor_cross_contact, exact: true })
    .selectOption("possible");
  await page.getByRole("checkbox", { name: ja.food_contact_oil, exact: true }).check();
  await page
    .getByRole("combobox", { name: ja.food_halal_certification, exact: true })
    .selectOption("not_certified");
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  const saved = configDraftSchema.parse(
    await (await page.request.get(`${api}/drafts/${draft.id}`)).json(),
  );
  expect(
    saved.configuration.products.find((product) => product.id === productId)?.foodInfo.base,
  ).toMatchObject({
    crossContact: "possible",
    crossContactSources: ["shared_equipment", "shared_frying_oil"],
    halalCertification: "not_certified",
  });
  await page.getByRole("tab", { name: "ブリオッシュ", exact: true }).click();
  await page.getByRole("group", { name: ja.food_required, exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("tablecast-food-editor-1180x820.png") });
  await page.getByRole("tab", { name: ja.food_base, exact: true }).click();
  await page.getByRole("group", { name: ja.food_halal, exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-food-editor-dietary-1180x820.png"),
  });
});
