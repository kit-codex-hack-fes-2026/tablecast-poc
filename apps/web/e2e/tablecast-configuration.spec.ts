import { readFileSync } from "node:fs";
import { z } from "zod";
import { catalogSchema, configDraftSchema } from "@tablecast/api/schema";
import { expect, test, type Locator } from "@playwright/test";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

const credentials = z
  .object({ email: z.string(), password: z.string() })
  .parse(JSON.parse(readFileSync(new URL("../../../.local/demo.json", import.meta.url), "utf8")));

test.use({ trace: "off", actionTimeout: 15_000 });

for (const { language, labels, locale } of [
  { language: "日本語", labels: ja, locale: "ja" },
  { language: "英語", labels: en, locale: "en" },
] as const) {
  test(`${language}で設定を追加して再編集し、検証エラーを直して下書きを破棄する`, async ({
    page,
    request: staff,
    baseURL,
  }, testInfo) => {
    const base = "/api/admin/stores/tablecast-akari";
    const headers = { Origin: baseURL ?? "" };
    let draftId = "";
    expect(
      (await staff.post("/api/auth/sign-in/email", { headers, data: credentials })).status(),
    ).toBe(200);
    try {
      const catalogResponse = await staff.get(`${base}/catalog`);
      expect(catalogResponse.status()).toBe(200);
      const original = catalogSchema.parse(await catalogResponse.json());
      await page.goto("/login?returnStoreId=tablecast-akari");
      await page
        .getByRole("button", { name: locale === "en" ? "English" : "日本語", exact: true })
        .click();
      await page.getByLabel(labels.auth_email).fill(credentials.email);
      await page.getByLabel(labels.auth_password, { exact: true }).fill(credentials.password);
      await page.getByRole("button", { name: labels.auth_sign_in, exact: true }).click();
      await expect(page).toHaveURL(/\/admin\/live/);
      await expect(
        page.getByRole("combobox", { name: labels.admin_store, exact: true }),
      ).toHaveValue("tablecast-akari");
      await page.getByRole("button", { name: labels.admin_config, exact: true }).click();
      const creating = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `${base}/drafts` &&
          response.request().method() === "POST",
      );
      await page.getByRole("button", { name: labels.editor_create_draft, exact: true }).click();
      const createdResponse = await creating;
      expect(createdResponse.status()).toBe(200);
      const created = configDraftSchema.parse(await createdResponse.json());
      draftId = created.id;
      const dialog = page.getByRole("dialog", { name: labels.admin_config, exact: true });
      const section = dialog.getByRole("combobox", { name: labels.editor_section, exact: true });
      const save = dialog.getByRole("button", { name: labels.common_save, exact: true });
      const validate = dialog.getByRole("button", { name: labels.admin_validate, exact: true });
      const publish = dialog.getByRole("button", { name: labels.admin_publish, exact: true });
      const content = (name: string) => ({ ja: `確認用${name}`, en: `Review ${name}` });
      async function fillText(scope: Locator, name: string) {
        for (const languageKey of ["ja", "en"] as const) {
          // グループ内の最初の言語欄は、配下の選択肢とは別の本文欄。
          const group = scope
            .getByRole("group", {
              name: languageKey === "ja" ? labels.common_ja : labels.common_en,
              exact: true,
            })
            .first();
          await group
            .getByRole("textbox", { name: labels.admin_display_name, exact: true })
            .fill(content(name)[languageKey]);
          await group
            .getByRole("textbox", { name: labels.admin_speech_name, exact: true })
            .fill(content(name)[languageKey]);
          await group
            .getByRole("textbox", { name: labels.admin_description, exact: true })
            .fill(content(name)[languageKey]);
        }
      }
      async function saveDraft() {
        const saving = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === `${base}/drafts/${draftId}` &&
            response.request().method() === "PUT",
        );
        await save.click();
        const response = await saving;
        expect(response.status()).toBe(200);
        return configDraftSchema.parse(await response.json());
      }
      async function validateDraft() {
        const validating = page.waitForResponse(
          (response) => new URL(response.url()).pathname === `${base}/drafts/${draftId}/validate`,
        );
        await validate.click();
        const response = await validating;
        expect(response.status()).toBe(200);
        return configDraftSchema.parse(await response.json());
      }
      async function reopen() {
        await dialog.getByRole("button", { name: labels.common_close, exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await page
          .locator(`[data-draft-id="${draftId}"]`)
          .getByRole("button", { name: labels.admin_review_draft, exact: true })
          .click();
        await expect(dialog).toBeVisible();
      }

      // 未保存の新規商品を取り消しても、保存済みの商品の入力欄へ戻る。
      await dialog.getByRole("button", { name: labels.editor_add_product, exact: true }).click();
      await dialog.getByRole("button", { name: labels.common_cancel, exact: true }).click();
      await expect(
        dialog.getByRole("combobox", { name: labels.admin_product, exact: true }),
      ).toHaveValue(original.configuration.products[0]?.id ?? "");
      await expect(save).toBeDisabled();
      await expect(dialog.getByLabel(labels.admin_unit_price, { exact: true })).toBeVisible();

      // カテゴリと商品を作り、安全情報・分類・画像参照を名前付きの入力欄で編集する。
      await section.selectOption("categories");
      await dialog.getByRole("button", { name: labels.editor_add_category, exact: true }).click();
      await fillText(dialog, "カテゴリ");
      const categoryId = await dialog
        .getByRole("combobox", { name: labels.editor_category, exact: true })
        .inputValue();
      await section.selectOption("products");
      await dialog.getByRole("button", { name: labels.editor_add_product, exact: true }).click();
      await fillText(dialog, "商品");
      const productId = await dialog
        .getByRole("combobox", { name: labels.admin_product, exact: true })
        .inputValue();
      await dialog.getByLabel(labels.admin_unit_price, { exact: true }).fill("800");
      const japaneseProduct = dialog.getByRole("group", { name: labels.common_ja, exact: true });
      await japaneseProduct
        .getByRole("button", {
          name: `${labels.editor_add}: ${labels.editor_aliases}`,
          exact: true,
        })
        .click();
      await japaneseProduct
        .getByRole("textbox", { name: `${labels.editor_aliases} 1`, exact: true })
        .fill("確認用の検索名");
      await dialog.locator("summary").filter({ hasText: labels.editor_product_details }).click();
      await dialog
        .getByRole("combobox", { name: labels.editor_category, exact: true })
        .selectOption(categoryId);
      await dialog
        .getByRole("button", { name: `${labels.editor_add}: ${labels.editor_tags}`, exact: true })
        .click();
      await dialog
        .getByRole("textbox", { name: `${labels.editor_tags} 1`, exact: true })
        .fill("tablecast-review");
      await dialog
        .getByRole("textbox", { name: labels.editor_image, exact: true })
        .fill("/images/tablecast-review.svg");
      await dialog
        .getByRole("combobox", { name: labels.editor_image_kind, exact: true })
        .selectOption("photograph");
      await dialog.locator("summary").filter({ hasText: labels.kiosk_allergens }).click();
      await dialog
        .getByRole("button", {
          name: `${labels.editor_add}: ${labels.editor_contains}`,
          exact: true,
        })
        .click();
      await dialog
        .getByRole("textbox", { name: `${labels.editor_contains} 1`, exact: true })
        .fill("soy");
      await dialog
        .getByRole("combobox", { name: labels.editor_evidence, exact: true })
        .selectOption("verified");
      await dialog
        .getByRole("combobox", { name: labels.editor_cross_contact, exact: true })
        .selectOption("possible");
      await dialog
        .getByRole("combobox", { name: labels.editor_vegan, exact: true })
        .selectOption("no");
      for (const languageKey of ["ja", "en"] as const) {
        await dialog
          .getByRole("textbox", {
            name: `${labels.editor_safety_note} · ${languageKey === "ja" ? labels.common_ja : labels.common_en}`,
            exact: true,
          })
          .fill(content("安全情報")[languageKey]);
      }
      await dialog.screenshot({ path: testInfo.outputPath("tablecast-configuration-safety.png") });
      await dialog
        .getByRole("combobox", { name: labels.editor_evidence, exact: true })
        .scrollIntoViewIfNeeded();
      await dialog.screenshot({
        path: testInfo.outputPath("tablecast-configuration-evidence.png"),
      });

      // 単一・複数・数量の各方式と、選択肢の依存・排他条件を下書きへ保存する。
      await dialog.locator("summary").filter({ hasText: labels.editor_modifiers }).click();
      const modifiers = dialog.getByRole("group", { name: labels.editor_modifiers, exact: true });
      for (const [index, kind] of ["single", "multiple", "quantity"].entries()) {
        await modifiers
          .getByRole("button", { name: labels.editor_add_modifier, exact: true })
          .click();
        const group = modifiers.locator(":scope > fieldset").nth(index);
        await fillText(group, `グループ${index + 1}`);
        await group
          .getByRole("combobox", { name: labels.editor_kind, exact: true })
          .selectOption(kind);
        await group.getByLabel(labels.editor_min, { exact: true }).fill("1");
        await group
          .getByLabel(labels.editor_max, { exact: true })
          .fill(kind === "quantity" ? "3" : "1");
        const option = group
          .getByRole("group", { name: labels.editor_options, exact: true })
          .locator(":scope > fieldset")
          .first();
        await fillText(option, `選択肢${index + 1}`);
        await option.getByLabel(labels.editor_price_delta, { exact: true }).fill("100");
        await option
          .getByLabel(labels.editor_max_quantity, { exact: true })
          .fill(kind === "quantity" ? "3" : "1");
        await option.getByRole("checkbox", { name: labels.editor_available, exact: true }).check();
      }
      const multipleOption = modifiers
        .locator(":scope > fieldset")
        .nth(1)
        .getByRole("group", { name: content("選択肢2")[locale], exact: true });
      const requiredIds = await multipleOption
        .getByRole("listbox", { name: labels.editor_requires, exact: true })
        .selectOption({ label: `${content("グループ1")[locale]} · ${content("選択肢1")[locale]}` });
      const excludedIds = await multipleOption
        .getByRole("listbox", { name: labels.editor_excludes, exact: true })
        .selectOption({ label: `${content("グループ3")[locale]} · ${content("選択肢3")[locale]}` });
      await multipleOption
        .getByRole("listbox", { name: labels.editor_excludes, exact: true })
        .scrollIntoViewIfNeeded();
      await dialog.screenshot({
        path: testInfo.outputPath("tablecast-configuration-modifiers.png"),
      });

      // プラン対象と制限を追加し、ラストオーダーだけ業務検証に通らない値にする。
      await section.selectOption("plans");
      await dialog.getByRole("button", { name: labels.editor_add_plan, exact: true }).click();
      await fillText(dialog, "プラン");
      const planId = await dialog
        .getByRole("combobox", { name: labels.editor_plan, exact: true })
        .inputValue();
      for (const [label, value] of [
        [labels.editor_plan_price, "2000"],
        [labels.editor_duration, "60"],
        [labels.editor_last_order, "70"],
        [labels.editor_max_order, "2"],
        [labels.editor_max_person, "8"],
        [labels.editor_interval, "30"],
      ]) {
        if (!label || !value) throw new Error("プランの入力値がありません");
        await dialog.getByLabel(label, { exact: true }).fill(value);
      }
      await dialog
        .getByRole("listbox", { name: labels.editor_included_products, exact: true })
        .selectOption(productId);
      await dialog
        .getByRole("listbox", { name: labels.editor_included_categories, exact: true })
        .selectOption(categoryId);
      await dialog
        .getByRole("button", {
          name: `${labels.editor_add}: ${labels.editor_included_tags}`,
          exact: true,
        })
        .click();
      await dialog
        .getByRole("textbox", { name: `${labels.editor_included_tags} 1`, exact: true })
        .fill("tablecast-review");
      await dialog
        .getByRole("listbox", { name: labels.editor_excluded_options, exact: true })
        .selectOption(excludedIds);
      await dialog
        .getByRole("checkbox", { name: labels.editor_option_surcharge, exact: true })
        .check();
      await dialog.getByLabel(labels.editor_last_order, { exact: true }).scrollIntoViewIfNeeded();
      await dialog.screenshot({ path: testInfo.outputPath("tablecast-configuration-plan.png") });
      await section.selectOption("cast");
      for (const languageKey of ["ja", "en"] as const) {
        const group = dialog.getByRole("group", {
          name: languageKey === "ja" ? labels.common_ja : labels.common_en,
          exact: true,
        });
        await group
          .getByRole("textbox", { name: labels.editor_cast_instructions, exact: true })
          .fill(content("接客方針")[languageKey]);
        await expect(
          group.getByRole("combobox", { name: labels.editor_voice, exact: true }),
        ).toHaveValue(original.configuration.cast.voice[languageKey] ?? "");
      }
      await dialog
        .getByRole("checkbox", { name: labels.editor_proactive, exact: true })
        .setChecked(!original.configuration.cast.proactive);
      const saved = await saveDraft();
      const product = saved.configuration.products.find((item) => item.id === productId);
      expect(product).toMatchObject({
        categoryId,
        price: 800,
        available: false,
        tags: ["tablecast-review"],
        imageKey: "/images/tablecast-review.svg",
        imageKind: "photograph",
        text: { ja: { aliases: ["確認用の検索名"] } },
        allergens: {
          contains: ["soy"],
          evidence: "verified",
          crossContact: "possible",
          vegan: "no",
          note: content("安全情報"),
        },
      });
      expect(
        product?.modifiers.map((group) => ({ kind: group.kind, min: group.min, max: group.max })),
      ).toEqual([
        { kind: "single", min: 1, max: 1 },
        { kind: "multiple", min: 1, max: 1 },
        { kind: "quantity", min: 1, max: 3 },
      ]);
      expect(product?.modifiers[1]?.options[0]).toMatchObject({
        priceDelta: 100,
        available: true,
        requires: requiredIds,
        excludes: excludedIds,
      });
      expect(saved.configuration.plans.find((item) => item.id === planId)).toMatchObject({
        pricePerPerson: 2000,
        durationMinutes: 60,
        lastOrderMinutesBeforeEnd: 70,
        maxPerOrder: 2,
        maxTotalPerPerson: 8,
        intervalSeconds: 30,
        productIds: [productId],
        categoryIds: [categoryId],
        tags: ["tablecast-review"],
        excludedOptionIds: excludedIds,
        includedOptionSurcharge: true,
      });
      expect(saved.configuration.cast).toEqual({
        instructions: content("接客方針"),
        voice: original.configuration.cast.voice,
        proactive: !original.configuration.cast.proactive,
      });
      expect(saved.changes.some((change) => change.sensitive)).toBe(true);
      await expect(publish).toBeDisabled();

      // 再取得後も入力値を保ち、日英の検証表示から修正して ready へ進める。
      await reopen();
      await dialog
        .getByRole("combobox", { name: labels.admin_product, exact: true })
        .selectOption(productId);
      await dialog.locator("summary").filter({ hasText: labels.kiosk_allergens }).click();
      await expect(
        dialog.getByRole("combobox", { name: labels.editor_evidence, exact: true }),
      ).toHaveValue("verified");
      await expect(
        dialog.getByRole("textbox", { name: `${labels.editor_contains} 1`, exact: true }),
      ).toHaveValue("soy");
      await section.selectOption("cast");
      await expect(
        dialog
          .getByRole("group", { name: labels.common_en, exact: true })
          .getByRole("textbox", { name: labels.editor_cast_instructions, exact: true }),
      ).toHaveValue(content("接客方針").en);
      await section.scrollIntoViewIfNeeded();
      await dialog.screenshot({ path: testInfo.outputPath("tablecast-configuration-cast.png") });
      await dialog
        .getByRole("checkbox", { name: labels.editor_proactive, exact: true })
        .scrollIntoViewIfNeeded();
      await dialog.screenshot({
        path: testInfo.outputPath("tablecast-configuration-cast-end.png"),
      });
      const invalid = await validateDraft();
      expect(invalid.status).toBe("draft");
      expect(invalid.errors).toEqual([
        expect.objectContaining({ code: "PLAN_LAST_ORDER_INVALID" }),
      ]);
      await expect(dialog.getByRole("list", { name: labels.config_error_list })).toContainText(
        labels.config_error_last_order,
      );
      await expect(publish).toBeDisabled();
      await dialog.getByRole("list", { name: labels.config_error_list }).scrollIntoViewIfNeeded();
      await dialog.screenshot({
        path: testInfo.outputPath("tablecast-configuration-validation.png"),
      });
      await section.selectOption("plans");
      await dialog
        .getByRole("combobox", { name: labels.editor_plan, exact: true })
        .selectOption(planId);
      await expect(dialog.getByLabel(labels.editor_last_order, { exact: true })).toHaveValue("70");
      await expect(
        dialog.getByRole("listbox", { name: labels.editor_included_products, exact: true }),
      ).toHaveValues([productId]);
      await dialog.getByLabel(labels.editor_last_order, { exact: true }).fill("10");
      await saveDraft();
      const ready = await validateDraft();
      expect(ready.status).toBe("ready");
      expect(ready.errors).toEqual([]);
      await expect(publish).toBeEnabled();
      await expect(dialog.getByRole("list", { name: labels.config_error_list })).not.toBeVisible();
      const discarding = page.waitForResponse(
        (response) => new URL(response.url()).pathname === `${base}/drafts/${draftId}/discard`,
      );
      await dialog.getByRole("button", { name: labels.editor_discard_draft, exact: true }).click();
      const discardedResponse = await discarding;
      expect(discardedResponse.status()).toBe(200);
      expect(configDraftSchema.parse(await discardedResponse.json()).status).toBe("discarded");
      await expect(dialog).not.toBeVisible();
      const current = await staff.get(`${base}/catalog`);
      expect(current.status()).toBe(200);
      expect(catalogSchema.parse(await current.json())).toEqual(original);
    } finally {
      try {
        if (draftId) {
          const response = await staff.get(`${base}/drafts/${draftId}`);
          expect(response.status()).toBe(200);
          const current = configDraftSchema.parse(await response.json());
          if (current.status === "draft" || current.status === "ready") {
            const discarded = await staff.post(`${base}/drafts/${draftId}/discard`, {
              headers,
              data: { expectedVersion: current.version },
            });
            expect(discarded.status()).toBe(200);
            expect(configDraftSchema.parse(await discarded.json()).status).toBe("discarded");
          }
        }
      } finally {
        await page.request.post("/api/auth/sign-out", { headers, data: {} });
        await staff.post("/api/auth/sign-out", { headers, data: {} });
      }
    }
  });
}
