import type { Configuration, Locale } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { CastEditor } from "./configuration-editor";

let client: QueryClient;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : input, window.location.origin);
    if (url.pathname === "/api/admin/stores/tablecast-cast-editor/voices")
      return Response.json({
        voices: [
          { voiceId: "marin", displayName: "Marin", langCode: url.searchParams.get("locale") },
        ],
        nextPageToken: null,
      });
    throw new Error(`未定義の要求: ${url.pathname}`);
  });
});
afterEach(async () => {
  await cleanup();
  client.clear();
  vi.restoreAllMocks();
  await page.viewport(1280, 720);
});

function Fixture({ locale }: { locale: Locale }) {
  const [value, onChange] = useState<Configuration["cast"]>({
    instructions: {
      ja: "## 接客の方針\n\nお客様の好みを確かめ、料理に合うお飲み物を一品ずつ提案してください。\n\n- 注文は最後に確認する\n- 原材料が不明な場合はスタッフに確認する",
      en: "## Service guidelines\n\nAsk about each guest's preferences and recommend one drink to complement their meal.\n\n- Confirm the order before placing it\n- Ask a member of staff when ingredients are unclear",
    },
    voice: { ja: "marin", en: "marin" },
    proactive: false,
  });
  return (
    <QueryClientProvider client={client}>
      <LocaleProvider initialLocale={locale} persist={false}>
        <main className="mx-auto max-w-5xl p-4">
          <CastEditor
            storeId="tablecast-cast-editor"
            value={value}
            voices={[value.voice]}
            onChange={onChange}
            disabled={false}
          />
        </main>
      </LocaleProvider>
    </QueryClientProvider>
  );
}

it.each([
  { locale: "ja", width: 390 },
  { locale: "en", width: 390 },
  { locale: "ja", width: 1280 },
  { locale: "en", width: 1280 },
] as const)(
  "$locale・幅$widthで一言語を広く編集し、切替後も本文を保持する",
  async ({ locale, width }) => {
    await page.viewport(width, 844);
    await render(<Fixture locale={locale} />);
    const label = locale === "ja" ? "日本語 接客方針" : "English Service instructions";
    const input = page.getByRole("textbox", { name: label, exact: true });
    await expect.element(input).toBeVisible();
    const source = input.element().getAttribute("lang");
    expect(source).toBe(locale);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    const edited =
      locale === "ja"
        ? "## 保存前の接客方針\n\n丁寧に案内してください。"
        : "## Unsaved instructions\n\nSpeak calmly.";
    await input.fill(edited);
    await page
      .getByRole("tab", { name: locale === "ja" ? "English" : "日本語", exact: true })
      .click();
    await page
      .getByRole("tab", { name: locale === "ja" ? "日本語" : "English", exact: true })
      .click();
    await expect.element(input).toHaveValue(edited);
    await page.viewport(width, 1100);
    await page.screenshot({
      path: `../../../test-results/tablecast-cast-editor-${locale}-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("tab", { name: locale === "ja" ? "プレビュー" : "Preview", exact: true })
      .click();
    await expect
      .element(
        page.getByRole("heading", {
          name: locale === "ja" ? "保存前の接客方針" : "Unsaved instructions",
          exact: true,
        }),
      )
      .toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  },
);
