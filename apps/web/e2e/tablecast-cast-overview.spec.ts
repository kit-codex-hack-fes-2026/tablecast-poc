import { expect } from "@playwright/test";
import { catalogSchema, configDraftSchema } from "@tablecast/api/schema";
import { test } from "./support/test";
import { credentials } from "./support/runtime";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };

test.use({ trace: "off" });

for (const { locale, labels } of [
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const) {
  test(`${locale}で接客概要から各設定へ移動し、既存下書きを保存・公開して概要へ戻る`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize(
      locale === "ja" ? { width: 1440, height: 1000 } : { width: 820, height: 1180 },
    );
    const storeId = "tablecast-hanul";
    const api = `/api/admin/stores/${storeId}`;
    const menu = `/admin/stores/${storeId}/menu`;
    const headers = { Origin: baseURL ?? "" };
    expect(
      (await page.request.post("/api/auth/sign-in/email", { headers, data: credentials })).status(),
    ).toBe(200);
    const original = catalogSchema.parse(await (await page.request.get(`${api}/catalog`)).json());
    const created = await page.request.post(`${api}/drafts`, { headers, data: {} });
    expect(created.status()).toBe(200);
    const draft = configDraftSchema.parse(await created.json());

    // 旧詳細URLでも単一の接客概要へ戻し、不要な一覧操作を出さない。
    await page.goto(`${menu}/cast/settings`);
    await expect(page).toHaveURL(new RegExp(`${menu}/cast$`));
    await page
      .getByRole("button", { name: locale === "ja" ? "日本語" : "English", exact: true })
      .click();
    const main = page.getByRole("main");
    await expect(
      main.getByRole("heading", { name: labels.editor_cast, exact: true }),
    ).toBeVisible();
    await expect(main.getByRole("table")).toHaveCount(0);
    await expect(main.getByRole("searchbox")).toHaveCount(0);
    await main.screenshot({
      path: testInfo.outputPath(`tablecast-cast-published-before-${locale}.png`),
    });
    let newDraftRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname === `${api}/drafts`)
        newDraftRequests++;
    });
    const englishVoiceLabel = labels.cast_edit_voice.replace("{language}", labels.common_en);
    await main.getByRole("button", { name: englishVoiceLabel, exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: labels.workflow_resume, exact: true })
      .click();
    const editPath = `${menu}/changes/${draft.id}/cast/settings`;
    await expect(page).toHaveURL(new RegExp(`${editPath}#voice-en$`));
    await expect(
      main.getByRole("combobox", {
        name: `${labels.common_en} ${labels.editor_voice}`,
        exact: true,
      }),
    ).toBeFocused();
    expect(newDraftRequests).toBe(0);
    await main.getByRole("link", { name: labels.editor_cast, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${menu}/changes/${draft.id}/cast$`));

    // 同じ下書きの各概要項目が、対応する入力へfocusを移す。
    for (const target of [
      {
        hash: "voice-ja",
        label: labels.cast_edit_voice.replace("{language}", labels.common_ja),
        role: "combobox",
        field: `${labels.common_ja} ${labels.editor_voice}`,
      },
      {
        hash: "proactive",
        label: labels.cast_edit_proactive,
        role: "checkbox",
        field: labels.editor_proactive,
      },
      {
        hash: "instructions-en",
        label: labels.cast_edit_instructions.replace("{language}", labels.common_en),
        role: "textbox",
        field: `${labels.common_en} ${labels.editor_cast_instructions}`,
      },
    ] as const) {
      await main.getByRole("link", { name: target.label, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${editPath}#${target.hash}$`));
      await expect(main.getByRole(target.role, { name: target.field, exact: true })).toBeFocused();
      await main.getByRole("link", { name: labels.editor_cast, exact: true }).click();
    }
    await main
      .getByRole("link", {
        name: labels.cast_edit_instructions.replace("{language}", labels.common_ja),
        exact: true,
      })
      .click();
    const instructions = main.getByRole("textbox", {
      name: `${labels.common_ja} ${labels.editor_cast_instructions}`,
      exact: true,
    });
    await expect(instructions).toBeFocused();
    const nextInstructions =
      "お客さまの質問に丁寧に答え、料理の特徴を簡潔に紹介してください。必要な場合はスタッフへ確認してください。\n".repeat(
        24,
      );
    await instructions.fill(nextInstructions);
    await main
      .getByRole("combobox", { name: `${labels.common_en} ${labels.editor_voice}`, exact: true })
      .selectOption("cedar");
    await main
      .getByRole("checkbox", { name: labels.editor_proactive, exact: true })
      .setChecked(!original.configuration.cast.proactive);
    const savedResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === `${api}/drafts/${draft.id}` &&
        response.request().method() === "PUT",
    );
    await main.getByRole("button", { name: labels.common_save, exact: true }).click();
    const saved = await savedResponse;
    expect(saved.status()).toBe(200);
    const changedDraft = configDraftSchema.parse(await saved.json());
    expect(changedDraft.configuration.cast.instructions.ja).toBe(nextInstructions);
    await expect(
      main.getByRole("link", { name: labels.workflow_review, exact: true }),
    ).toBeEnabled();
    await page.reload();
    await expect(instructions).toHaveValue(nextInstructions);
    await main.getByRole("link", { name: labels.editor_cast, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${menu}/changes/${draft.id}/cast$`));
    const catalogBeforePublish = catalogSchema.parse(
      await (await page.request.get(`${api}/catalog`)).json(),
    );
    expect(catalogBeforePublish).toEqual(original);
    await main.getByRole("button", { name: labels.cast_show_full, exact: true }).first().click();
    const fullText = page.getByRole("dialog", {
      name: labels.editor_cast_instructions,
      exact: true,
    });
    await expect(fullText.locator("p[lang='ja']")).toHaveText(nextInstructions);
    await page.keyboard.press("Escape");
    await expect(
      main.getByRole("button", { name: labels.cast_show_full, exact: true }).first(),
    ).toBeFocused();
    await main.screenshot({ path: testInfo.outputPath(`tablecast-cast-draft-${locale}.png`) });
    await main.getByRole("link", { name: labels.workflow_review, exact: true }).click();
    expect(new URL(page.url()).searchParams.get("returnSection")).toBe("cast");
    await main.getByRole("button", { name: labels.admin_validate, exact: true }).click();
    const publish = main.getByRole("button", { name: labels.admin_publish, exact: true });
    await expect(publish).toBeEnabled();
    await publish.click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: labels.admin_publish, exact: true })
      .click();
    await main.getByRole("link", { name: labels.workflow_view_published, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${menu}/cast$`));
    await expect(main.getByText("Cedar", { exact: true })).toBeVisible();
    const current = catalogSchema.parse(await (await page.request.get(`${api}/catalog`)).json());
    expect(current.version).toBe(original.version + 1);
    expect(current.configuration.cast).toEqual(changedDraft.configuration.cast);
    await main.screenshot({
      path: testInfo.outputPath(`tablecast-cast-published-after-${locale}.png`),
    });
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.screenshot({
      path: testInfo.outputPath(`tablecast-cast-ipad-landscape-${locale}.png`),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await page.screenshot({
      path: testInfo.outputPath(`tablecast-cast-large-text-${locale}.png`),
      fullPage: true,
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
    await page.goto(`${menu}/changes/${draft.id}/cast`);
    await expect(
      main.getByRole("heading", { level: 1 }).getByText(labels.draft_published, { exact: true }),
    ).toBeVisible();
    await expect(main.getByRole("link", { name: englishVoiceLabel, exact: true })).toHaveCount(0);
    await expect(main.getByRole("button", { name: englishVoiceLabel, exact: true })).toHaveCount(0);
  });
}
