import type { Locale } from "@tablecast/api/schema";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { StoreKnowledge } from "./store-knowledge";

afterEach(async () => {
  await cleanup();
  await page.viewport(1280, 720);
});
function Fixture({ locale, editable = true }: { editable?: boolean; locale: Locale }) {
  const [skills, setSkills] = useState(catalog.configuration.cast.skills ?? []);
  return (
    <LocaleProvider initialLocale={locale} persist={false}>
      <main className="mx-auto max-w-5xl p-4">
        <StoreKnowledge value={skills} onChange={editable ? setSkills : undefined} />
      </main>
    </LocaleProvider>
  );
}

it.each([
  { locale: "ja", width: 1280 },
  { locale: "en", width: 390 },
] as const)(
  "$locale・幅$widthで資料を選び、編集とプレビュー切替後も原文を保持する",
  async ({ locale, width }) => {
    await page.viewport(width, 900);
    await render(<Fixture locale={locale} />);
    await page.getByRole("button", { name: "references/visit.md", exact: true }).click();
    await expect
      .element(
        page.getByRole("heading", {
          name: "営業時間・アクセス / Opening hours and access",
          exact: true,
        }),
      )
      .toBeVisible();
    await page.getByRole("tab", { name: locale === "ja" ? "原文" : "Source", exact: true }).click();
    const input = page.getByRole("textbox", {
      name: locale === "ja" ? "ファイルの原文" : "File source",
      exact: true,
    });
    const content =
      "# 更新した営業時間 / Updated hours\n\n17:00–23:00\n\n<script>window.tablecastUnsafe = true</script>\n[リンク](https://example.test/private)\n![外部画像](https://example.test/image.png)";
    await input.fill(content);
    await page
      .getByRole("tab", { name: locale === "ja" ? "プレビュー" : "Preview", exact: true })
      .click();
    await expect
      .element(page.getByRole("heading", { name: "更新した営業時間 / Updated hours", exact: true }))
      .toBeVisible();
    expect(document.querySelector('img[src="https://example.test/image.png"]')).toBeNull();
    expect(document.querySelector('a[href="https://example.test/private"]')).toBeNull();
    expect(document.querySelector("script")?.textContent).not.toContain("tablecastUnsafe");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    await page.getByRole("button", { name: "SKILL.md", exact: true }).click();
    await page.getByRole("button", { name: "references/visit.md", exact: true }).click();
    await page.getByRole("tab", { name: locale === "ja" ? "原文" : "Source", exact: true }).click();
    await expect.element(input).toHaveValue(content);
  },
);

it("公開資料の表示は編集操作を持たず、こもれびの参照ファイルを表示する", async () => {
  await page.viewport(1280, 1000);
  await render(<Fixture locale="ja" editable={false} />);
  await expect
    .element(page.getByRole("button", { name: "references/sake.md", exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "references/sake.md", exact: true }).click();
  await expect
    .element(
      page.getByRole("heading", {
        name: "日本酒・温度・ペアリング / Sake and pairings",
        exact: true,
      }),
    )
    .toBeVisible();
  await expect
    .element(page.getByRole("button", { name: "Skillを追加", exact: true }))
    .not.toBeInTheDocument();
  await page.getByRole("button", { name: "references/visit.md", exact: true }).click();
  await page.screenshot({
    path: "../../../test-results/tablecast-store-knowledge-ja.png",
    fullPage: false,
  });
});

it("資料追加と削除で必須のSKILL.mdを保つ", async () => {
  await render(<Fixture locale="ja" />);
  await page.getByRole("button", { name: "Skillを追加", exact: true }).click();
  await page.getByRole("button", { name: "ファイルを追加", exact: true }).click();
  const content = page.getByRole("textbox", { name: "ファイルの原文", exact: true });
  await content.fill("# 新しい資料");
  await page.getByRole("button", { name: "ファイルを削除", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "ファイルを削除", exact: true }))
    .toBeDisabled();
  await page.getByRole("button", { name: "Skillを削除", exact: true }).click();
  await expect
    .element(page.getByRole("button", { name: "references/sake.md", exact: true }))
    .toBeVisible();
});
