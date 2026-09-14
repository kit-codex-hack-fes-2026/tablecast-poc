import { test } from "./support/test";
import { expect } from "@playwright/test";
import { catalogSchema, configDraftSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { credentials } from "./support/runtime";

for (const { locale, labels } of [
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
]) {
  test(`${locale}で接客設定を保存・再表示し、明示公開後に公開APIへ反映する`, async ({
    page,
    baseURL,
  }, testInfo) => {
    // Given: 外部音声キーのない隔離環境で店長が下書きを作る。
    const headers = { Origin: baseURL ?? "" };
    expect(
      (await page.request.post("/api/auth/sign-in/email", { headers, data: credentials })).status(),
    ).toBe(200);
    const api = "/api/admin/stores/tablecast-hanul";
    const original = catalogSchema.parse(await (await page.request.get(`${api}/catalog`)).json());
    const created = await page.request.post(`${api}/drafts`, { headers, data: {} });
    const draft = configDraftSchema.parse(await created.json());
    try {
      await page.goto(`/admin/stores/tablecast-hanul/menu/changes/${draft.id}/cast/settings`);
      await page
        .getByRole("button", { name: locale === "ja" ? "日本語" : "English", exact: true })
        .click();
      const japaneseVoice = page.getByRole("combobox", {
        name: `${labels.common_ja} ${labels.editor_voice}`,
        exact: true,
      });
      const englishVoice = page.getByRole("combobox", {
        name: `${labels.common_en} ${labels.editor_voice}`,
        exact: true,
      });
      // When: 日英の音声を選び、既存の保存操作を実行する。
      await expect(japaneseVoice).toBeVisible();
      await expect(englishVoice).toBeVisible();
      await expect(
        japaneseVoice.getByRole("option", { name: "Marin", exact: true }),
      ).toBeAttached();
      await japaneseVoice.selectOption("marin");
      await englishVoice.selectOption("cedar");
      await page.getByRole("button", { name: labels.common_save, exact: true }).click();
      await expect(
        page.getByRole("status").filter({ hasText: labels.account_saved }),
      ).toBeVisible();
      await page.reload();
      // Then: 実DBに保存され、ページを開き直しても選択を維持する。
      await expect(japaneseVoice).toHaveValue("marin");
      await expect(englishVoice).toHaveValue("cedar");
      await expect(
        japaneseVoice.getByRole("option", { name: "Marin", exact: true }),
      ).toBeAttached();
      const saved = configDraftSchema.parse(
        await (await page.request.get(`${api}/drafts/${draft.id}`)).json(),
      );
      expect(saved.configuration.cast.voice).toEqual({ ja: "marin", en: "cedar" });
      await page.screenshot({
        path: testInfo.outputPath(`tablecast-gpt-live-voices-${locale}.png`),
        fullPage: true,
      });
      // When: 保存値を確認して検証し、公開確認を承認する。
      await page.getByRole("link", { name: labels.workflow_review, exact: true }).click();
      await expect(
        page.getByRole("heading", { name: labels.admin_review_draft, exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: labels.admin_validate, exact: true }).click();
      const publish = page.getByRole("button", { name: labels.admin_publish, exact: true });
      await expect(publish).toBeEnabled();
      await publish.click();
      const confirmation = page.getByRole("dialog", {
        name: labels.workflow_publish_title,
        exact: true,
      });
      await expect(confirmation).toBeVisible();
      expect(catalogSchema.parse(await (await page.request.get(`${api}/catalog`)).json())).toEqual(
        original,
      );
      await confirmation.screenshot({
        path: testInfo.outputPath(`tablecast-cast-publish-confirmation-${locale}.png`),
      });
      await confirmation.getByRole("button", { name: labels.admin_publish, exact: true }).click();
      await expect(
        page.getByRole("link", { name: labels.workflow_view_published, exact: true }),
      ).toBeVisible();
      // Then: 公開APIと直接開いた接客概要に保存した標準音声が反映される。
      const published = catalogSchema.parse(
        await (await page.request.get(`${api}/catalog`)).json(),
      );
      expect(published.version).toBe(original.version + 1);
      expect(published.configuration.cast.voice).toEqual({ ja: "marin", en: "cedar" });
      expect(
        configDraftSchema.parse(await (await page.request.get(`${api}/drafts/${draft.id}`)).json())
          .status,
      ).toBe("published");
      await page.goto("/admin/stores/tablecast-hanul/menu/cast/settings");
      await expect(page.getByRole("main").getByText(/^marin$/i)).toBeVisible();
      await expect(page.getByRole("main").getByText(/^cedar$/i)).toBeVisible();
    } finally {
      const current = configDraftSchema.parse(
        await (await page.request.get(`${api}/drafts/${draft.id}`)).json(),
      );
      if (current.status === "draft" || current.status === "ready")
        await page.request.post(`${api}/drafts/${draft.id}/discard`, {
          headers,
          data: { expectedVersion: current.version },
        });
    }
  });
}
