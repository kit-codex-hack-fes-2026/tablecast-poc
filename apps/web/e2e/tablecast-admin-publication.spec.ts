import { test } from "./support/test";
import { expect } from "@playwright/test";
import { catalogSchema, configDraftSchema, type Catalog } from "@tablecast/api/schema";
import en from "../messages/en.json" with { type: "json" };
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";

test.use({ trace: "off", actionTimeout: 15_000 });

for (const { language, labels, locale } of [
  { language: "日本語", labels: ja, locale: "ja-JP" },
  { language: "英語", labels: en, locale: "en-GB" },
]) {
  test(`${language}の管理画面で商品を編集・再確認・検証し、明示公開後にだけ価格が変わる`, async ({
    page,
    request: staff,
    baseURL,
  }, testInfo) => {
    const storeId = "tablecast-akari";
    const adminPath = `/api/admin/stores/${storeId}`;
    const headers = { Origin: baseURL ?? "" };
    const ownDraftIds: string[] = [];
    let original: Catalog | undefined;
    let draftId = "";
    const login = await staff.post("/api/auth/sign-in/email", { data: credentials, headers });
    expect(login.status()).toBe(200);
    try {
      // MCPの外部入力に相当する検証済み下書きだけを実HTTPで準備する。
      const catalog = await staff.get(`${adminPath}/catalog`);
      expect(catalog.status()).toBe(200);
      original = catalogSchema.parse(await catalog.json());
      const created = await staff.post(`${adminPath}/drafts`, { headers, data: {} });
      expect(created.status()).toBe(200);
      const draft = configDraftSchema.parse(await created.json());
      draftId = draft.id;
      ownDraftIds.push(draftId);
      expect(draft.baseVersion).toBe(original.version);
      const prepared = await staff.post(`${adminPath}/drafts/${draftId}/validate`, {
        headers,
        data: { expectedVersion: draft.version },
      });
      expect(prepared.status()).toBe(200);
      expect(configDraftSchema.parse(await prepared.json()).status).toBe("ready");
      const product = original.configuration.products.find((item) => item.available);
      if (!product) throw new Error("編集対象の商品がありません");

      // 認証前の確認リンクから、ログイン後も同じ店舗と下書きへ戻る。
      await page.goto(`/admin/live?storeId=${storeId}&draftId=${draftId}`);
      await expect(page).toHaveURL(/\/login\?/);
      await page
        .getByRole("button", { name: language === "英語" ? "English" : "日本語", exact: true })
        .click();
      await page.getByLabel(labels.auth_email).fill(credentials.email);
      await page.getByLabel(labels.auth_password, { exact: true }).fill(credentials.password);
      await page.getByRole("button", { name: labels.auth_sign_in, exact: true }).click();
      const reviewPath = `/admin/stores/${storeId}/menu/changes/${draftId}`;
      const productPath = `${reviewPath}/products/${product.id}`;
      await expect(page).toHaveURL(new RegExp(reviewPath));
      await expect(
        page.getByRole("heading", { name: labels.admin_review_draft, exact: true }),
      ).toBeVisible();
      await page.goto(productPath);
      const editor = page.getByRole("main");
      let publicationRequests = 0;
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === `${adminPath}/drafts/${draftId}/publish`)
          publicationRequests++;
      });

      // 全編集項目を実際に保存する。公開前に価格以外はGUIから元へ戻す。
      const editedProduct = structuredClone(product);
      editedProduct.price += 100;
      editedProduct.available = false;
      await editor
        .getByLabel(labels.admin_unit_price, { exact: true })
        .fill(String(editedProduct.price));
      await editor
        .getByRole("checkbox", { name: labels.admin_available, exact: true })
        .first()
        .uncheck();
      const contentFields = [
        { key: "displayName", label: labels.admin_display_name },
        { key: "speechName", label: labels.admin_speech_name },
        { key: "description", label: labels.admin_description },
      ] as const;
      for (const contentLocale of ["ja", "en"] as const) {
        const group = editor
          .getByRole("group", {
            name: contentLocale === "ja" ? labels.common_ja : labels.common_en,
            exact: true,
          })
          .first();
        for (const { key, label } of contentFields) {
          editedProduct.text[contentLocale][key] +=
            contentLocale === "ja" ? "（確認用）" : " (review)";
          await group
            .getByRole("textbox", { name: label, exact: true })
            .fill(editedProduct.text[contentLocale][key]);
        }
      }
      await expect(editor.getByText(labels.admin_unsaved, { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: labels.admin_publish, exact: true }),
      ).toHaveCount(0);
      const savedResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `${adminPath}/drafts/${draftId}` &&
          response.request().method() === "PUT",
      );
      await editor.getByRole("button", { name: labels.common_save, exact: true }).click();
      const saved = await savedResponse;
      expect(saved.status()).toBe(200);
      const edited = configDraftSchema.parse(await saved.json());
      expect(edited.status).toBe("draft");
      expect(edited.configuration.products.find((item) => item.id === product.id)).toEqual(
        editedProduct,
      );

      // 個別URLを再読み込みしても保存済みの編集内容を復元する。
      await page.reload();
      await expect(page).toHaveURL(new RegExp(productPath));
      await expect(editor.getByLabel(labels.admin_unit_price, { exact: true })).toHaveValue(
        String(editedProduct.price),
      );
      await expect(
        editor.getByRole("checkbox", { name: labels.admin_available, exact: true }).first(),
      ).not.toBeChecked();
      await editor.screenshot({ path: testInfo.outputPath("tablecast-admin-product-editor.png") });
      await editor
        .getByRole("checkbox", { name: labels.admin_available, exact: true })
        .first()
        .check();
      for (const contentLocale of ["ja", "en"] as const) {
        const group = editor
          .getByRole("group", {
            name: contentLocale === "ja" ? labels.common_ja : labels.common_en,
            exact: true,
          })
          .first();
        for (const { key, label } of contentFields) {
          await expect(group.getByRole("textbox", { name: label, exact: true })).toHaveValue(
            editedProduct.text[contentLocale][key],
          );
          await group
            .getByRole("textbox", { name: label, exact: true })
            .fill(product.text[contentLocale][key]);
        }
      }
      const savedPriceResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `${adminPath}/drafts/${draftId}` &&
          response.request().method() === "PUT",
      );
      await editor.getByRole("button", { name: labels.common_save, exact: true }).click();
      const savedPrice = await savedPriceResponse;
      expect(savedPrice.status()).toBe(200);
      const priceDraft = configDraftSchema.parse(await savedPrice.json());
      expect(priceDraft.version).toBe(edited.version + 1);
      expect(priceDraft.changes).toHaveLength(1);
      expect(priceDraft.changes[0]).toMatchObject({
        before: product.price,
        after: product.price + 100,
        sensitive: true,
      });
      await page.goto(reviewPath);
      const publish = page.getByRole("button", { name: labels.admin_publish, exact: true });
      const validate = page.getByRole("button", { name: labels.admin_validate, exact: true });
      await expect(publish).toBeDisabled();
      await expect(editor.getByText(labels.admin_sensitive, { exact: true })).toBeVisible();
      const prices = await page.evaluate(
        ({ amount, languageLocale }) => {
          const currency = new Intl.NumberFormat(languageLocale, {
            style: "currency",
            currency: "JPY",
            maximumFractionDigits: 0,
          });
          return { before: currency.format(amount), after: currency.format(amount + 100) };
        },
        { amount: product.price, languageLocale: locale },
      );
      const change = editor.locator("[data-ui='config-change']");
      await expect(change).toHaveCount(1);
      await expect(change.getByText(prices.before, { exact: true })).toBeVisible();
      await expect(change.getByText(prices.after, { exact: true })).toBeVisible();
      const validatedResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `${adminPath}/drafts/${draftId}/validate`,
      );
      await validate.click();
      const validated = await validatedResponse;
      expect(validated.status()).toBe(200);
      expect(configDraftSchema.parse(await validated.json()).status).toBe("ready");
      await expect(publish).toBeEnabled();
      const beforeApproval = await staff.get(`${adminPath}/catalog`);
      expect(beforeApproval.status()).toBe(200);
      expect(catalogSchema.parse(await beforeApproval.json())).toEqual(original);
      expect(publicationRequests).toBe(0);
      await editor.screenshot({
        path: testInfo.outputPath("tablecast-admin-publication-review.png"),
      });

      // この明示操作だけが公開を行う。変更は一商品の単価100円分に限定する。
      const publishedResponse = page.waitForResponse(
        (response) => new URL(response.url()).pathname === `${adminPath}/drafts/${draftId}/publish`,
      );
      await publish.click();
      const published = await publishedResponse;
      expect(published.status()).toBe(200);
      expect(configDraftSchema.parse(await published.json()).status).toBe("published");
      await expect(publish).toHaveCount(0);
      expect(publicationRequests).toBe(1);
      const current = await staff.get(`${adminPath}/catalog`);
      expect(current.status()).toBe(200);
      const changed = catalogSchema.parse(await current.json());
      expect(changed.version).toBe(original.version + 1);
      expect(changed.configuration).toEqual(priceDraft.configuration);
    } finally {
      try {
        try {
          if (original && draftId) {
            const response = await staff.get(`${adminPath}/drafts/${draftId}`);
            expect(response.status()).toBe(200);
            const currentDraft = configDraftSchema.parse(await response.json());
            if (currentDraft.status === "published") {
              const current = await staff.get(`${adminPath}/catalog`);
              expect(current.status()).toBe(200);
              const catalog = catalogSchema.parse(await current.json());
              expect(catalog.version, "別の公開がある場合は元設定を上書きしない").toBe(
                original.version + 1,
              );
              const created = await staff.post(`${adminPath}/drafts`, { headers, data: {} });
              expect(created.status()).toBe(200);
              const restoration = configDraftSchema.parse(await created.json());
              ownDraftIds.push(restoration.id);
              expect(restoration.baseVersion).toBe(catalog.version);
              const updated = await staff.put(`${adminPath}/drafts/${restoration.id}`, {
                headers,
                data: {
                  expectedVersion: restoration.version,
                  configuration: original.configuration,
                },
              });
              expect(updated.status()).toBe(200);
              const saved = configDraftSchema.parse(await updated.json());
              const validated = await staff.post(`${adminPath}/drafts/${restoration.id}/validate`, {
                headers,
                data: { expectedVersion: saved.version },
              });
              expect(validated.status()).toBe(200);
              const ready = configDraftSchema.parse(await validated.json());
              expect(ready.status).toBe("ready");
              const restored = await staff.post(`${adminPath}/drafts/${restoration.id}/publish`, {
                headers,
                data: {
                  expectedVersion: ready.version,
                  baseVersion: ready.baseVersion,
                  idempotencyKey: crypto.randomUUID(),
                  approved: true,
                },
              });
              expect(restored.status()).toBe(200);
              const finalCatalog = await staff.get(`${adminPath}/catalog`);
              expect(finalCatalog.status()).toBe(200);
              expect(catalogSchema.parse(await finalCatalog.json())).toEqual({
                ...original,
                version: original.version + 2,
              });
            }
          }
        } finally {
          const discarded = await Promise.allSettled(
            ownDraftIds.map(async (id) => {
              const response = await staff.get(`${adminPath}/drafts/${id}`);
              expect(response.status()).toBe(200);
              const draft = configDraftSchema.parse(await response.json());
              if (draft.status !== "draft" && draft.status !== "ready") return;
              const removed = await staff.post(`${adminPath}/drafts/${id}/discard`, {
                headers,
                data: { expectedVersion: draft.version },
              });
              expect(removed.status()).toBe(200);
              expect(configDraftSchema.parse(await removed.json()).status).toBe("discarded");
            }),
          );
          for (const result of discarded)
            expect(result.status, "作成した未公開下書きを破棄する").toBe("fulfilled");
        }
      } finally {
        const sessions = await Promise.allSettled(
          [staff, page.request].map(async (context) => {
            const logout = await context.post("/api/auth/sign-out", { headers, data: {} });
            expect(logout.status()).toBe(200);
          }),
        );
        for (const result of sessions)
          expect(result.status, "管理者の両セッションを終了する").toBe("fulfilled");
      }
    }
  });
}
