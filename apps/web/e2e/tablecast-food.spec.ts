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
  await expect(information.getByText(ja.food_selection_complete, { exact: true })).toBeVisible();
  const contains = information.getByText(ja.food_contains, { exact: true }).locator("..");
  await expect(contains).toContainText("乳");
  await detail.getByRole("radio", { name: /^レタス包み/ }).check();
  await detail.getByRole("radio", { name: /^植物由来パティ/ }).check();
  await expect(information.getByText(ja.food_selection_complete, { exact: true })).toBeVisible();
  await expect(contains).not.toContainText("乳");
  await expect(
    information.getByText(`${ja.food_vegan}: ${ja.food_yes}`, { exact: true }),
  ).toBeVisible();
  await expect(
    information.getByText(`${ja.editor_cross_contact}: ${ja.editor_unknown}`, { exact: true }),
  ).toBeVisible();
  for (const viewport of [
    { width: 1180, height: 820 },
    { width: 402, height: 874 },
    { width: 1512, height: 982 },
  ]) {
    await page.setViewportSize(viewport);
    await information.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`tablecast-food-${viewport.width}x${viewport.height}.png`),
    });
  }
  await page.setViewportSize({ width: 1180, height: 820 });
  await detail.getByRole("button", { name: ja.kiosk_add, exact: true }).click();
  await page.getByRole("tab", { name: new RegExp(`^${ja.kiosk_cart}`) }).click();
  await page.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
  await page.getByRole("button", { name: ja.kiosk_confirm, exact: true }).click();
  await expect(page.getByRole("dialog", { name: ja.kiosk_ordered, exact: true })).toBeVisible();
  const state = tableStateSchema.parse(await (await page.request.get(endpoint)).json());
  expect(state.orders[0]?.snapshot.lines[0]?.foodInformation).toMatchObject({
    allergens: { milk: "not_used", egg: "not_used", wheat: "not_used", soya: "contains" },
    dietary: {
      vegan: { status: "yes" },
      halal: { status: "unknown" },
      glutenFree: { status: "yes" },
    },
    crossContact: "unknown",
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
  await page.getByRole("button", { name: ja.common_save, exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
  const saved = configDraftSchema.parse(
    await (await page.request.get(`${api}/drafts/${draft.id}`)).json(),
  );
  expect(
    saved.configuration.products.find((product) => product.id === productId)?.foodInfo.base
      .crossContact,
  ).toBe("possible");
  await page.getByRole("heading", { name: ja.food_title, exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("tablecast-food-editor-1180x820.png") });
});
