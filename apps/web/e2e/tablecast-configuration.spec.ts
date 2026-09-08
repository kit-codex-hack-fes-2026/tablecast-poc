import { expect, test } from "@playwright/test";
import { configDraftSchema } from "@tablecast/api/schema";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";

for (const { locale, labels } of [
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const) {
  test(`${locale === "ja" ? "日本語" : "英語"}で商品詳細と編集をURLから再現し、保存した変更を確認する`, async ({
    page,
    baseURL,
  }) => {
    // Given: 試験用worktreeの店長と商品。
    expect(
      (
        await page.request.post("/api/auth/sign-in/email", {
          headers: { Origin: baseURL ?? "" },
          data: credentials,
        })
      ).ok(),
    ).toBe(true);
    const storeId = "tablecast-akari";
    const base = `/admin/stores/${storeId}/menu`;
    const api = `/api/admin/stores/${storeId}`;
    await page.goto(`${base}/products`);
    await page
      .getByRole("button", { name: locale === "ja" ? "日本語" : "English", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: labels.editor_products, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await page.getByRole("link", { name: labels.admin_details, exact: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`${base}/products/[^/]+$`));
    await expect(
      page.getByRole("heading", { name: labels.kiosk_allergens, exact: true }),
    ).toBeVisible();
    const detailUrl = page.url();
    await page.reload();
    await expect(page).toHaveURL(detailUrl);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: labels.kiosk_allergens, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    // When: 変更を作成し、価格を保存して編集URLを再読み込みする。
    const response = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `${api}/drafts` && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: labels.menu_start_editing, exact: true }).click();
    const draft = configDraftSchema.parse(await (await response).json());
    try {
      await expect(page).toHaveURL(new RegExp(`/changes/${draft.id}/products/`));
      const input = page.getByRole("spinbutton", { name: labels.admin_unit_price, exact: true });
      await input.fill("777");
      await page.getByRole("button", { name: labels.common_save, exact: true }).click();
      await expect(
        page.getByRole("status").filter({ hasText: labels.account_saved }),
      ).toBeVisible();
      await page.reload();
      await expect(input).toHaveValue("777");
      // Then: 個別ページから一覧、変更確認へ移動しても保存内容が維持される。
      await page.getByRole("link", { name: labels.editor_products, exact: true }).click();
      await page.getByRole("link", { name: labels.admin_drafts, exact: true }).click();
      await expect(page).toHaveURL(`${baseURL}${base}/changes/${draft.id}`);
      await expect(
        page.getByRole("heading", { name: labels.admin_review_draft, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: labels.admin_publish, exact: true }),
      ).toBeDisabled();
      await page.getByRole("button", { name: labels.editor_discard_draft, exact: true }).click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: labels.editor_discard_draft, exact: true })
        .click();
      await expect(page).toHaveURL(`${baseURL}${base}/changes`);
    } finally {
      const current = configDraftSchema.parse(
        await (await page.request.get(`${api}/drafts/${draft.id}`)).json(),
      );
      if (current.status === "draft" || current.status === "ready")
        await page.request.post(`${api}/drafts/${draft.id}/discard`, {
          headers: { Origin: baseURL ?? "" },
          data: { expectedVersion: current.version },
        });
    }
  });
}

test("端末登録はURLで再現でき、卓の選択で列幅が動かない", async ({ page, baseURL }) => {
  // Given: 店長が端末登録ページを直接開く。
  await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL ?? "" },
    data: credentials,
  });
  await page.goto("/admin/stores/tablecast-komorebi/devices/new?user_code=TABLECAST-TEST");
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await expect(page.getByRole("heading", { name: ja.admin_pair, exact: true })).toBeVisible();
  const table = page.getByRole("table");
  const before = await table.boundingBox();
  // When: 一覧から卓を選択し、同じURLを再読み込みする。
  await table.getByRole("button", { name: ja.common_select, exact: true }).first().click();
  const selectedUrl = page.url();
  expect(new URL(selectedUrl).searchParams.get("tableId")).toBeTruthy();
  const after = await table.boundingBox();
  expect(after?.width).toBe(before?.width);
  await page.reload();
  // Then: コードと選択した卓がURLから復元され、dialogは開かない。
  await expect(page.getByLabel(ja.admin_pair_code)).toHaveValue("TABLECAST-TEST");
  await expect(table.getByRole("button", { name: ja.common_selected, exact: true })).toHaveCount(1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
