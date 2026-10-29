import { resolveText } from "@tablecast/api/localization";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page } from "vitest/browser";
import { catalog } from "../../.storybook/tablecast-fixtures";
import { LocaleProvider } from "../i18n/locale";
import { LanguageLabel } from "./language-label";
import { LanguageSwitch } from "./language-switch";
import { ProductMenu } from "./product-menu";
import { SnapshotProductName } from "./product-name";
import "../styles.css";

let previousLanguage = "";
beforeEach(() => {
  previousLanguage = document.documentElement.lang;
});
afterEach(async () => {
  await cleanup();
  document.documentElement.lang = previousLanguage;
});

it.each(["en", "zh-Hans", "ko"])(
  "%sの商品カードは意味訳を先に、転写を補助色の下段へ括弧なしで表示する",
  async (locale) => {
    const product = catalog.configuration.products.find((item) => item.id.endsWith("-karaage"));
    if (!product) throw new Error("seedの唐揚げがありません。");
    const text = resolveText(product.text, locale);
    await render(
      <LocaleProvider initialLocale={locale} persist={false}>
        <div className="w-80">
          <ProductMenu
            compact
            catalog={catalog}
            productIds={[product.id]}
            onChoose={vi.fn<() => void>()}
          />
        </div>
      </LocaleProvider>,
    );
    const meaning = page.getByText(text.displayName, { exact: true });
    const transliteration = page.getByText(text.transliteration, { exact: true });
    await expect.element(meaning).toBeVisible();
    await expect.element(transliteration).toBeVisible();
    const first = meaning.element();
    const second = transliteration.element();
    expect(second.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      first.getBoundingClientRect().bottom,
    );
    expect(getComputedStyle(first).color).not.toBe(getComputedStyle(second).color);
    expect(second.classList.contains("text-muted-foreground")).toBe(true);
    expect(first.parentElement?.textContent).not.toMatch(/[()]/);
    expect(second.scrollWidth).toBeLessThanOrEqual(second.clientWidth);
  },
);

it("日本語では原名だけを表示し、追加言語の選択は旗と母語名を伴う", async () => {
  const product = catalog.configuration.products.find((item) => item.id.endsWith("-karaage"));
  if (!product) throw new Error("seedの唐揚げがありません。");
  const screen = await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <ProductMenu
        compact
        catalog={catalog}
        productIds={[product.id]}
        onChoose={vi.fn<() => void>()}
      />
      <LanguageSwitch
        availableLanguages={["ja", "en", "zh-Hans", "ko", "fr"]}
        onChange={vi.fn<() => void>()}
      />
      <LanguageLabel locale="fr" />
    </LocaleProvider>,
  );
  await expect.element(page.getByText(product.text.ja.displayName, { exact: true })).toBeVisible();
  expect(screen.container.querySelector(".text-muted-foreground[dir=auto]")).toBeNull();
  const french = screen.container.querySelector("[lang=fr]");
  expect(french?.textContent).toContain("français");
  const flag = french?.querySelector("img");
  expect(flag).toBeInstanceOf(HTMLImageElement);
  if (!(flag instanceof HTMLImageElement)) throw new Error("フランス語の旗がありません。");
  await flag.decode();
  expect(flag.naturalWidth).toBeGreaterThan(0);
});

it("注文の意味訳と転写は同じ言語から解決し、旧注文も表示できる", async () => {
  const name = { ja: "ほうじ茶", en: "Roasted green tea" };
  await render(
    <LocaleProvider initialLocale="fr" persist={false}>
      <SnapshotProductName line={{ name, transliteration: { ja: "ほうじちゃ", en: "Hōjicha" } }} />
      <SnapshotProductName line={{ name: { ja: "旧注文", en: "Legacy order" } }} />
    </LocaleProvider>,
  );
  await expect.element(page.getByText("Roasted green tea", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Hōjicha", { exact: true })).toBeVisible();
  await expect.element(page.getByText("Legacy order", { exact: true })).toBeVisible();
});

it("店側UIは客側の中国語設定を受け継がず日英で表示する", async () => {
  await render(
    <LocaleProvider initialLocale="zh-Hans" persist={false} staffOnly>
      <LanguageSwitch onChange={vi.fn<() => void>()} />
    </LocaleProvider>,
  );
  await expect
    .element(page.getByRole("button", { name: "English", exact: true }))
    .toHaveAttribute("aria-pressed", "true");
  expect(page.getByText("简体中文").elements()).toHaveLength(0);
});
