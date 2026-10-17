import { expect } from "@playwright/test";
import { adminStateSchema, catalogSchema, configDraftSchema } from "@tablecast/api/schema";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };
import { money } from "../src/i18n/format";

test.use({ trace: "off" });

test("商品を保存・再読込し、明示公開した価格だけを実際の客画面へ届ける", async ({
  page,
  request: staff,
  browser,
  baseURL,
}) => {
  const storeId = "tablecast-hanul";
  const api = `/api/admin/stores/${storeId}`;
  const headers = { Origin: baseURL ?? "" };
  expect((await staff.post("/api/auth/sign-in/email", { data: credentials, headers })).ok()).toBe(
    true,
  );
  const catalog = catalogSchema.parse(await (await staff.get(`${api}/catalog`)).json());
  const product = catalog.configuration.products.find((item) => item.available);
  if (!product) throw new Error("公開確認用の商品が必要です。");
  const draft = configDraftSchema.parse(
    await (await staff.post(`${api}/drafts`, { headers })).json(),
  );
  const state = adminStateSchema.parse(await (await staff.get(api)).json());
  const table = state.vacantTables.find((item) => item.name === "T10");
  if (!table) throw new Error("専用fixtureのT10が空席ではありません。");
  expect(
    (
      await staff.post(`${api}/tables/open`, {
        headers,
        data: { tableId: table.id, guestCount: 1, locale: "ja" },
      })
    ).ok(),
  ).toBe(true);
  const guest = await browser.newContext({ baseURL });
  try {
    const kiosk = await guest.newPage();
    await kiosk.goto("/");
    await kiosk.getByRole("button", { name: "日本語", exact: true }).click();
    await kiosk.getByRole("button", { name: ja.pair_begin, exact: true }).click();
    const userCode = await kiosk.getByRole("status", { name: ja.admin_pair_code }).innerText();
    expect(
      (
        await staff.post(`${api}/devices/approve`, {
          headers,
          data: { userCode, tableId: table.id },
        })
      ).ok(),
    ).toBe(true);
    const guestProduct = kiosk
      .locator("#tablecast-order button")
      .filter({ has: kiosk.getByText(product.text.ja.displayName, { exact: true }) });
    await expect(guestProduct).toContainText(money(product.price, "ja"));

    const reviewPath = `/admin/stores/${storeId}/menu/changes/${draft.id}`;
    await page.goto(`/admin/live?storeId=${storeId}&draftId=${draft.id}`);
    await page.getByRole("button", { name: "日本語", exact: true }).click();
    await page.getByLabel(ja.auth_email).fill(credentials.email);
    await page.getByLabel(ja.auth_password, { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: ja.auth_sign_in, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${reviewPath}$`));
    await expect(page.getByRole("button", { name: ja.admin_validate, exact: true })).toBeEnabled();
    await page.goto(`${reviewPath}/products/${product.id}`);
    const price = page.getByRole("spinbutton", { name: ja.admin_unit_price, exact: true });
    await price.fill(String(product.price + 100));
    await page.getByRole("button", { name: ja.common_save, exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: ja.account_saved })).toBeVisible();
    await page.reload();
    await expect(price).toHaveValue(String(product.price + 100));
    await expect(guestProduct).toContainText(money(product.price, "ja"));

    await page.goto(reviewPath);
    await page.getByRole("button", { name: ja.admin_validate, exact: true }).click();
    const publish = page.getByRole("button", { name: ja.admin_publish, exact: true });
    await expect(publish).toBeEnabled();
    await publish.click();
    const confirmation = page.getByRole("dialog", { name: ja.workflow_publish_title, exact: true });
    await expect(confirmation).toBeVisible();
    await expect(guestProduct).toContainText(money(product.price, "ja"));
    await confirmation.getByRole("button", { name: ja.admin_publish, exact: true }).click();
    await expect(publish).toHaveCount(0);
    await expect(guestProduct).toContainText(money(product.price + 100, "ja"));
    await kiosk.reload();
    await expect(guestProduct).toContainText(money(product.price + 100, "ja"));
  } finally {
    await guest.close();
  }
});
