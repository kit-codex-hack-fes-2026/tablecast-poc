import { type CartLine, productSchema } from "@tablecast/api/schema";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, userEvent } from "vitest/browser";
import { product } from "../../../.storybook/tablecast-fixtures";
import ja from "../../../messages/ja.json";
import { money } from "../../i18n/format";
import { LocaleProvider } from "../../i18n/locale";
import { fixtureValue } from "../../test-support/fixture-value";
import "../../styles.css";
import { ProductPage } from "./product-dialog";

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

let initialViewport: { height: number; width: number };
beforeEach(() => {
  initialViewport = { width: window.innerWidth, height: window.innerHeight };
});
afterEach(async () => {
  try {
    await cleanup();
  } finally {
    if (
      window.innerWidth !== initialViewport.width ||
      window.innerHeight !== initialViewport.height
    )
      await page.viewport(initialViewport.width, initialViewport.height);
  }
});

it("日本語で画像読込失敗後も説明と売切を確認し、3種類の選択を保存できる", async () => {
  const locale = "ja";
  const labels = ja;
  // Given: 実在しないメディア参照と画像なしの選択肢を同じ商品に置く。
  await page.viewport(768, 1024);
  const onSave = vi.fn<(line: CartLine, pointer: boolean, origin: DOMRect) => void>();
  const screen = await render(
    <LocaleProvider initialLocale={locale} persist={false}>
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
    name: "ごまバンズ",
    exact: true,
  });
  await expect
    .element(sesame)
    .toHaveAccessibleDescription(
      `${money(80, locale)} ${fixtureValue(fixtureValue(pictured.modifiers[0]).options[0]).text[locale].description}`,
    );
  await expect.poll(() => document.querySelectorAll("img").length).toBe(0);
  await expect.element(screen.getByText(labels.kiosk_sold_out, { exact: true })).toBeVisible();
  await expect
    .element(
      screen.getByRole("radio", {
        name: "ブリオッシュ",
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
    name: "プレーン",
    exact: true,
  });
  await expect.element(plain).toBeChecked();
  await screen.getByRole("checkbox", { name: "レタス", exact: true }).click();
  const increase = screen.getByRole("button", {
    name: "チェダーチーズ: 数量を増やす",
    exact: true,
  });
  await expect
    .element(increase)
    .toHaveAccessibleDescription(
      `${money(100, locale)} ${fixtureValue(fixtureValue(pictured.modifiers[2]).options[0]).text[locale].description}`,
    );
  await expect
    .element(screen.getByRole("checkbox", { name: "レタス", exact: true }))
    .toHaveAccessibleDescription(
      `${money(40, locale)} ${fixtureValue(fixtureValue(pictured.modifiers[1]).options[0]).text[locale].description}`,
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
    true,
    expect.any(DOMRect),
  );
  await expect.element(screen.getByRole("textbox")).not.toBeInTheDocument();
  for (const [width, height] of [
    [768, 1024],
    [1024, 768],
  ] as const) {
    await page.viewport(width, height);
    const region = screen
      .getByRole("region", { name: pictured.text[locale].displayName, exact: true })
      .element();
    expect(region.scrollWidth).toBeLessThanOrEqual(region.clientWidth);
    const add = screen.getByRole("button", { name: labels.kiosk_add, exact: true });
    await expect.element(add).toBeEnabled();
  }
});
