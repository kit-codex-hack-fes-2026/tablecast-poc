import { test } from "./support/test";
import { expect } from "@playwright/test";
import { configDraftSchema } from "@tablecast/api/schema";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import { credentials } from "./support/runtime";

for (const { locale, labels } of [
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
]) {
  test(`${locale}でGPT-Live標準音声を選び保存して再表示できる`, async ({
    page,
    baseURL,
  }, testInfo) => {
    // Given: 外部音声キーのない隔離環境で店長が下書きを作る。
    const headers = { Origin: baseURL ?? "" };
    expect(
      (await page.request.post("/api/auth/sign-in/email", { headers, data: credentials })).status(),
    ).toBe(200);
    const api = "/api/admin/stores/tablecast-akari";
    const created = await page.request.post(`${api}/drafts`, { headers, data: {} });
    const draft = configDraftSchema.parse(await created.json());
    try {
      await page.goto(`/admin/stores/tablecast-akari/menu/changes/${draft.id}/cast/settings`);
      await page
        .getByRole("button", { name: locale === "ja" ? "日本語" : "English", exact: true })
        .click();
      const selects = page.getByRole("combobox", { name: labels.editor_voice, exact: true });
      // When: 日英の音声を選び、既存の保存操作を実行する。
      await expect(selects).toHaveCount(2);
      await expect(
        selects.nth(0).getByRole("option", { name: "Marin", exact: true }),
      ).toBeAttached();
      await selects.nth(0).selectOption("marin");
      await selects.nth(1).selectOption("cedar");
      await page.getByRole("button", { name: labels.common_save, exact: true }).click();
      await expect(
        page.getByRole("status").filter({ hasText: labels.account_saved }),
      ).toBeVisible();
      await page.reload();
      // Then: 実DBに保存され、ページを開き直しても選択を維持する。
      await expect(selects.nth(0)).toHaveValue("marin");
      await expect(selects.nth(1)).toHaveValue("cedar");
      await expect(
        selects.nth(0).getByRole("option", { name: "Marin", exact: true }),
      ).toBeAttached();
      const saved = configDraftSchema.parse(
        await (await page.request.get(`${api}/drafts/${draft.id}`)).json(),
      );
      expect(saved.configuration.cast.voice).toEqual({ ja: "marin", en: "cedar" });
      await page.screenshot({
        path: testInfo.outputPath(`tablecast-gpt-live-voices-${locale}.png`),
        fullPage: true,
      });
    } finally {
      const current = configDraftSchema.parse(
        await (await page.request.get(`${api}/drafts/${draft.id}`)).json(),
      );
      await page.request.post(`${api}/drafts/${draft.id}/discard`, {
        headers,
        data: { expectedVersion: current.version },
      });
    }
  });
}
