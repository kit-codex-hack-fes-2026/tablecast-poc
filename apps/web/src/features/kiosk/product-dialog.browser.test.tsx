import { productSchema, type CartLine } from "@tablecast/api/schema";
import { afterEach, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { cleanup, render } from "vitest-browser-react";
import { product } from "../../../.storybook/tablecast-fixtures";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { money } from "../../i18n/format";
import { LocaleProvider } from "../../i18n/locale";
import { ProductPage } from "./product-dialog";
import "../../styles.css";

const text = (jaName: string, enName: string, jaDescription = "", enDescription = "") => ({
  ja: { displayName: jaName, speechName: jaName, description: jaDescription, aliases: [] },
  en: { displayName: enName, speechName: enName, description: enDescription, aliases: [] },
});
const pictured = productSchema.parse({
  ...product,
  imageKey: null,
  modifiers: [
    {
      id: "tablecast-bun",
      text: text("バンズ", "Bun"),
      kind: "single",
      min: 1,
      max: 1,
      options: [
        {
          id: "tablecast sesame",
          priceDelta: 80,
          available: true,
          text: text(
            "ごまバンズ",
            "Sesame bun",
            "表面にごまをのせたバンズ。",
            "A bun topped with sesame seeds.",
          ),
          imageKey: "tablecast/images/tablecast-unavailable-sesame.webp",
          imageKind: "photograph",
        },
        {
          id: "tablecast-plain",
          priceDelta: 0,
          available: true,
          text: text("プレーン", "Plain bun"),
        },
        {
          id: "tablecast-sold-out",
          priceDelta: 0,
          text: text("ブリオッシュ", "Brioche"),
          available: false,
        },
      ],
    },
    {
      id: "tablecast-garnish",
      text: text("トッピング", "Toppings"),
      kind: "multiple",
      min: 0,
      max: 1,
      options: [
        {
          id: "tablecast-lettuce",
          priceDelta: 40,
          available: true,
          text: text("レタス", "Lettuce", "歯触りのある葉野菜。", "Crisp leaves."),
          imageKey: "tablecast/images/tablecast-unavailable-lettuce.webp",
        },
      ],
    },
    {
      id: "tablecast-cheese",
      text: text("チーズ追加", "Extra cheese"),
      kind: "quantity",
      min: 0,
      max: 2,
      options: [
        {
          id: "tablecast-cheddar",
          available: true,
          text: text("チェダーチーズ", "Cheddar", "1枚ずつ追加。", "Add one slice at a time."),
          imageKey: "tablecast/images/tablecast-unavailable-cheddar.webp",
          priceDelta: 100,
          maxQuantity: 2,
        },
      ],
    },
  ],
});

afterEach(cleanup);

it.each([
  { locale: "ja", labels: ja },
  { locale: "en", labels: en },
] as const)(
  "$localeで画像読込失敗後も説明と売切を確認し、3種類の選択を保存できる",
  async ({ locale, labels }) => {
    // Given: 実在しないメディア参照と画像なしの選択肢を同じ商品に置く。
    await page.viewport(768, 1024);
    const onSave = vi.fn<(line: CartLine) => void>();
    const screen = await render(
      <LocaleProvider initialLocale={locale}>
        <div className="max-w-md bg-card">
          <ProductPage
            product={pictured}
            busy={false}
            onClose={vi.fn<() => void>()}
            onSave={onSave}
          />
        </div>
      </LocaleProvider>,
    );
    const sesame = screen.getByRole("radio", {
      name: locale === "ja" ? "ごまバンズ" : "Sesame bun",
      exact: true,
    });
    await expect
      .element(sesame)
      .toHaveAccessibleDescription(
        `${money(80, locale)} ${pictured.modifiers[0].options[0].text[locale].description}`,
      );
    await expect.poll(() => document.querySelectorAll("img").length).toBe(0);
    await expect.element(screen.getByText(labels.kiosk_sold_out, { exact: true })).toBeVisible();
    await expect
      .element(
        screen.getByRole("radio", {
          name: locale === "ja" ? "ブリオッシュ" : "Brioche",
          exact: true,
        }),
      )
      .toBeDisabled();
    // When: キーボードで単一選択を変更し、複数選択と数量上限を操作する。
    sesame.element().focus();
    await userEvent.keyboard(" ");
    await expect.element(sesame).toBeChecked();
    await userEvent.keyboard("{ArrowDown}");
    const plain = screen.getByRole("radio", {
      name: locale === "ja" ? "プレーン" : "Plain bun",
      exact: true,
    });
    await expect.element(plain).toBeChecked();
    await screen
      .getByRole("checkbox", { name: locale === "ja" ? "レタス" : "Lettuce", exact: true })
      .click();
    const increase = screen.getByRole("button", {
      name: locale === "ja" ? "チェダーチーズ: 数量を増やす" : "Cheddar: Increase quantity",
      exact: true,
    });
    await expect
      .element(increase)
      .toHaveAccessibleDescription(
        `${money(100, locale)} ${pictured.modifiers[2].options[0].text[locale].description}`,
      );
    await expect
      .element(
        screen.getByRole("checkbox", { name: locale === "ja" ? "レタス" : "Lettuce", exact: true }),
      )
      .toHaveAccessibleDescription(
        `${money(40, locale)} ${pictured.modifiers[1].options[0].text[locale].description}`,
      );
    await increase.click();
    await increase.click();
    await expect.element(increase).toBeDisabled();
    await screen.getByRole("button", { name: labels.kiosk_add, exact: true }).click();
    // Then: 画像の取得成否によらず、選んだIDと数量だけをカートへ送る。
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: pictured.id,
        quantity: 1,
        selections: [
          { optionId: "tablecast-plain", quantity: 1 },
          { optionId: "tablecast-lettuce", quantity: 1 },
          { optionId: "tablecast-cheddar", quantity: 2 },
        ],
      }),
    );
    await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
    // 固定 px の本文も含めて文字を 2 倍にし、画像枠と操作の横はみ出しを調べる。
    const sizes = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) =>
        [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        ),
      )
      .map((element) => ({ element, size: Number.parseFloat(getComputedStyle(element).fontSize) }));
    for (const { element, size } of sizes) element.style.fontSize = `${size * 2}px`;
    for (const [width, height] of [
      [768, 1024],
      [1024, 768],
    ]) {
      await page.viewport(width, height);
      const region = screen
        .getByRole("region", { name: pictured.text[locale].displayName, exact: true })
        .element();
      expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
      const add = screen.getByRole("button", { name: labels.kiosk_add, exact: true });
      await expect.element(add).toBeEnabled();
    }
  },
);
