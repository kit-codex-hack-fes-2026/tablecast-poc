import { expect } from "@playwright/test";
import { catalogSchema, configDraftSchema } from "@tablecast/api/schema";
import { test } from "./support/test";
import { money } from "../src/i18n/format";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

test.use({ trace: "off" });

for (const { locale, labels } of [
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const) {
  test(`${locale}で商品検索から既存下書きを再開して公開し、元の絞り込み一覧へ戻る`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize(
      locale === "ja" ? { width: 1280, height: 800 } : { width: 1024, height: 768 },
    );
    const storeId = "tablecast-hanul";
    const api = `/api/admin/stores/${storeId}`;
    const menu = `/admin/stores/${storeId}/menu`;
    const headers = { Origin: baseURL ?? "" };
    const login = await page.request.post("/api/auth/sign-in/email", {
      headers,
      data: credentials,
    });
    expect(login.status()).toBe(200);
    const initialResponse = await page.request.get(`${api}/catalog`);
    expect(initialResponse.status()).toBe(200);
    const original = catalogSchema.parse(await initialResponse.json());
    const product = original.configuration.products.find((item) => item.available);
    if (!product) throw new Error("編集対象の販売中商品がありません");
    const created = await page.request.post(`${api}/drafts`, { headers, data: {} });
    expect(created.status()).toBe(200);
    const draft = configDraftSchema.parse(await created.json());

    await page.goto(`${menu}/products`);
    await page
      .getByRole("button", { name: locale === "ja" ? "日本語" : "English", exact: true })
      .click();
    await page
      .getByRole("searchbox", { name: labels.menu_search })
      .fill(product.text[locale === "ja" ? "en" : "ja"].displayName);
    await page
      .getByRole("combobox", { name: labels.editor_category, exact: true })
      .selectOption(product.categoryId);
    await page.getByRole("combobox", { name: labels.menu_availability }).selectOption("available");
    const row = page
      .getByRole("row")
      .filter({ has: page.getByText(product.text[locale].displayName, { exact: true }) });
    await expect(row).toBeVisible();
    await expect(page).toHaveURL(/availability=available/);
    const context = new URL(page.url()).search;
    await page
      .getByRole("main")
      .screenshot({ path: testInfo.outputPath(`tablecast-menu-search-${locale}.png`) });
    await row.getByRole("link", { name: labels.admin_details, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${menu}/products/${product.id}`));
    expect(new URL(page.url()).search).toBe(context);
    let newDraftRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === `${api}/drafts`)
        newDraftRequests++;
    });
    await page.getByRole("button", { name: labels.menu_start_editing, exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: labels.workflow_resume, exact: true })
      .click();
    const editPath = `${menu}/changes/${draft.id}/products/${product.id}`;
    await expect(page).toHaveURL(new RegExp(editPath));
    expect(new URL(page.url()).search).toBe(context);
    expect(newDraftRequests).toBe(0);
    const input = page.getByRole("spinbutton", { name: labels.admin_unit_price, exact: true });
    await input.fill(String(product.price + 100));
    page.once("dialog", (dialog) => void dialog.dismiss());
    await page
      .getByRole("main")
      .getByRole("link", { name: labels.editor_products, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(editPath));
    await expect(input).toHaveValue(String(product.price + 100));
    const savedResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${api}/drafts/${draft.id}` &&
        response.request().method() === "PUT",
    );
    await page.getByRole("button", { name: labels.common_save, exact: true }).click();
    const saved = await savedResponse;
    expect(saved.status()).toBe(200);
    const savedDraft = configDraftSchema.parse(await saved.json());
    expect(savedDraft.configuration.products.find((item) => item.id === product.id)?.price).toBe(
      product.price + 100,
    );
    const review = page.getByRole("link", { name: labels.workflow_review, exact: true });
    await expect(review).toBeEnabled();
    await review.click();
    await expect(
      page.getByRole("heading", { name: labels.admin_review_draft, exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("returnSection")).toBe("products");
    await page.getByRole("button", { name: labels.admin_validate, exact: true }).click();
    const publish = page.getByRole("button", { name: labels.admin_publish, exact: true });
    await expect(publish).toBeEnabled();
    await publish.click();
    const publishedResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === `${api}/drafts/${draft.id}/publish`,
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: labels.admin_publish, exact: true })
      .click();
    const published = await publishedResponse;
    expect(published.status()).toBe(200);
    expect(configDraftSchema.parse(await published.json()).status).toBe("published");
    await page.getByRole("link", { name: labels.workflow_view_published, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${menu}/products\\?`));
    expect(new URL(page.url()).search).toBe(context);
    await expect(page.getByRole("searchbox", { name: labels.menu_search })).toHaveValue(
      product.text[locale === "ja" ? "en" : "ja"].displayName,
    );
    await expect(
      page.getByRole("combobox", { name: labels.editor_category, exact: true }),
    ).toHaveValue(product.categoryId);
    await expect(page.getByRole("combobox", { name: labels.menu_availability })).toHaveValue(
      "available",
    );
    await expect(row.getByText(money(product.price + 100, locale), { exact: true })).toBeVisible();
    const currentResponse = await page.request.get(`${api}/catalog`);
    expect(currentResponse.status()).toBe(200);
    const current = catalogSchema.parse(await currentResponse.json());
    expect(current.version).toBe(original.version + 1);
    expect(current.configuration.products.find((item) => item.id === product.id)?.price).toBe(
      product.price + 100,
    );
    await page
      .getByRole("main")
      .screenshot({ path: testInfo.outputPath(`tablecast-menu-published-${locale}.png`) });
    await page.getByRole("link", { name: labels.editor_categories, exact: true }).click();
    await expect(
      page.getByRole("heading", { name: labels.editor_categories, exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).search).toBe("");
  });
}
