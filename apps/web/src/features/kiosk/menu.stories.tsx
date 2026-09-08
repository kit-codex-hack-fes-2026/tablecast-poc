import type { Meta, StoryObj } from "@storybook/react-vite";
import { productSchema, type CartLine, type Product } from "@tablecast/api/schema";
import { expect, fn, userEvent, within } from "storybook/test";
import { catalog, product, table } from "../../../.storybook/tablecast-fixtures";
import { CartLines } from "./cart-lines";
import { ProductMenu } from "./menu";
import { ProductPage } from "./product-dialog";

const meta = {
  title: "客向け/メニューと注文",
  component: ProductMenu,
  decorators: [
    (Story) => (
      <div className="max-w-md pt-5 min-w-0 min-h-0 flex flex-col border-l border-l-border bg-card max-lg:border-l-0 max-lg:border-t max-lg:border-t-border max-lg:min-h-160">
        <Story />
      </div>
    ),
  ],
  args: { catalog, onChoose: fn() },
} satisfies Meta<typeof ProductMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Products: Story = {
  name: "画像なしと売切",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const soldOut = canvas.getByRole("button", { name: /こもれび 白霞 にごり酒/ });
    await expect(soldOut).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: /こもれび 月凪 純米吟醸/ }));
    await expect(args.onChoose).toHaveBeenCalledWith(product);
  },
};
export const EnglishProducts: Story = { name: "長い英語の商品名", globals: { locale: "en" } };
export const Customisation: Story = {
  name: "必須カスタマイズ",
  render: () => <ProductPage product={product} busy={false} onClose={fn()} onSave={fn()} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement);
    await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
    await expect(body.getByRole("region", { name: product.text.ja.displayName })).toBeVisible();
    await expect(body.queryByRole("radio", { name: "選択しない" })).not.toBeInTheDocument();
    await userEvent.click(body.getByRole("radio", { name: /90 mL/ }));
    await expect(body.getByRole("radio", { name: /90 mL/ })).toBeChecked();
    await expect(body.queryByRole("textbox")).not.toBeInTheDocument();
  },
};
const optionalLine: CartLine = {
  id: "tablecast-optional-line",
  productId: product.id,
  quantity: 2,
  selections: [{ optionId: "tablecast-large-glass", quantity: 1 }],
};
const saveOptional = fn<(line: CartLine) => void>();
export const OptionalCustomisation: Story = {
  name: "任意の単一選択をカート編集から解除する",
  render: () => (
    <ProductPage
      product={{
        ...product,
        modifiers: product.modifiers.map((group) => ({ ...group, min: 0 })),
      }}
      initial={optionalLine}
      busy={false}
      onClose={fn()}
      onSave={saveOptional}
    />
  ),
  play: async ({ canvasElement, globals, step }) => {
    const body = within(canvasElement.ownerDocument.body);
    const english = globals.locale === "en";
    saveOptional.mockClear();
    await step("前提: 選択済みのカート行を編集する", async () => {
      await expect(body.getByRole("radio", { name: /90 mL/ })).toBeChecked();
    });
    await step("操作: 選択しないへ戻して更新する", async () => {
      await userEvent.click(
        body.getByRole("radio", { name: english ? "No selection" : "選択しない" }),
      );
      await userEvent.click(body.getByRole("button", { name: english ? "Update" : "更新する" }));
    });
    await step("結果: 商品と数量を保ち、選択肢を除去して保存する", async () => {
      await expect(saveOptional).toHaveBeenCalledTimes(1);
      await expect(saveOptional).toHaveBeenCalledWith({
        ...optionalLine,
        selections: [],
      });
    });
  },
};
export const EnglishOptionalCustomisation: Story = {
  ...OptionalCustomisation,
  name: "英語で任意の単一選択をカート編集から解除する",
  globals: { locale: "en" },
};

const relationText = (ja: string, en: string) => ({
  ja: { ...product.text.ja, displayName: ja, speechName: ja },
  en: { ...product.text.en, displayName: en, speechName: en },
});
const relatedProduct: Product = {
  ...product,
  text: relationText("デザート", "Dessert"),
  modifiers: [
    {
      id: "tablecast-sauce",
      text: relationText("ソース", "Sauce"),
      kind: "multiple",
      min: 0,
      max: 2,
      options: [
        {
          id: "tablecast-yoghurt",
          text: relationText("ヨーグルトソース", "Yoghurt sauce"),
          priceDelta: 0,
          available: true,
          maxQuantity: 1,
          requires: ["tablecast-berries"],
          excludes: ["tablecast-chocolate"],
        },
        {
          id: "tablecast-chocolate",
          text: relationText("チョコソース", "Chocolate sauce"),
          priceDelta: 0,
          available: true,
          maxQuantity: 1,
          requires: [],
          excludes: ["tablecast-yoghurt"],
        },
      ],
    },
    {
      id: "tablecast-fruit",
      text: relationText("フルーツ追加", "Extra fruit"),
      kind: "quantity",
      min: 0,
      max: 2,
      options: [
        {
          id: "tablecast-berries",
          text: relationText("ベリー", "Berries"),
          priceDelta: 100,
          available: true,
          maxQuantity: 2,
          requires: [],
          excludes: [],
        },
      ],
    },
  ],
};
const relatedLine: CartLine = {
  id: "tablecast-related-line",
  productId: relatedProduct.id,
  quantity: 2,
  selections: [{ optionId: "tablecast-chocolate", quantity: 1 }],
};
const saveRelated = fn<(line: CartLine) => void>();
export const RelatedCustomisation: Story = {
  name: "相互排他の選択を外し、別グループの依存条件をタッチで満たす",
  render: () => (
    <ProductPage
      product={relatedProduct}
      initial={relatedLine}
      busy={false}
      onClose={fn()}
      onSave={saveRelated}
    />
  ),
  play: async ({ canvasElement, globals, step }) => {
    const body = within(canvasElement.ownerDocument.body);
    const english = globals.locale === "en";
    const chocolate = body.getByRole("checkbox", {
      name: english ? "Chocolate sauce" : "チョコソース",
    });
    const yoghurt = body.getByRole("checkbox", {
      name: english ? "Yoghurt sauce" : "ヨーグルトソース",
    });
    saveRelated.mockClear();
    await step("前提: 相互排他となるソースが選択されている", async () => {
      await expect(chocolate).toBeChecked();
      await expect(yoghurt).not.toBeChecked();
    });
    await step("操作: ソースを選び直し、依存するベリーを2つ追加して更新する", async () => {
      await userEvent.click(chocolate);
      await userEvent.click(yoghurt);
      const increase = body.getByRole("button", {
        name: english ? "Berries: Increase quantity" : "ベリー: 数量を増やす",
      });
      await userEvent.click(increase);
      await userEvent.click(increase);
      await userEvent.click(body.getByRole("button", { name: english ? "Update" : "更新する" }));
    });
    await step("結果: 商品数量を維持し、依存を含み排他対象を含まない選択を送る", async () => {
      await expect(chocolate).not.toBeChecked();
      await expect(yoghurt).toBeChecked();
      await expect(saveRelated).toHaveBeenCalledTimes(1);
      await expect(saveRelated).toHaveBeenCalledWith({
        ...relatedLine,
        selections: [
          { optionId: "tablecast-yoghurt", quantity: 1 },
          { optionId: "tablecast-berries", quantity: 2 },
        ],
      });
      await expect(body.queryByRole("textbox")).not.toBeInTheDocument();
    });
  },
};
export const EnglishRelatedCustomisation: Story = {
  ...RelatedCustomisation,
  name: "英語で相互排他の選択を外し、依存条件をタッチで満たす",
  globals: { locale: "en" },
};
const longProduct = productSchema.parse({
  ...product,
  text: {
    ja: {
      ...product.text.ja,
      displayName: "季節の料理に合う、香りと余韻を楽しむ日本酒。".repeat(10).slice(0, 150),
      description: "香りや味わい、料理との組み合わせについての商品説明です。"
        .repeat(120)
        .slice(0, 3000),
    },
    en: {
      ...product.text.en,
      displayName: "A fragrant sake with a gentle finish, served alongside seasonal dishes. "
        .repeat(3)
        .slice(0, 150),
      description: "This description explains the flavour, aroma and pairing with seasonal dishes. "
        .repeat(50)
        .slice(0, 3000),
    },
  },
});
const saveLongProduct = fn<(line: CartLine) => void>();
export const LongDescription: Story = {
  name: "上限の長い商品名と説明でも選択欄と注文ボタンへ到達する",
  globals: { locale: "en" },
  render: () => (
    <div className="h-160 min-h-0 overflow-y-auto" data-testid="product-page-scroll">
      <ProductPage product={longProduct} busy={false} onClose={fn()} onSave={saveLongProduct} />
    </div>
  ),
  play: async ({ canvasElement, step }) => {
    const document = canvasElement.ownerDocument;
    const body = within(document.body);
    const add = body.getByRole("button", { name: "Add to basket" });
    const back = body.getByRole("button", { name: "Our menu" });
    const firstOption = body.getByRole("radio", { name: "60 mL" });
    const scroll = body.getByTestId("product-page-scroll");
    saveLongProduct.mockClear();
    await step("前提: 長い本文でも固定操作は画面内にある", async () => {
      const viewportHeight = document.documentElement.clientHeight;
      await expect(body.queryByRole("dialog")).not.toBeInTheDocument();
      await expect(back.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
      await expect(add.getBoundingClientRect().bottom).toBeLessThanOrEqual(viewportHeight);
    });
    await step("操作: キーボードで選択欄へ移動し、スクロールして選択する", async () => {
      back.focus();
      await userEvent.tab();
      await expect(firstOption).toHaveFocus();
      await expect(scroll.clientHeight).toBeGreaterThan(0);
      await expect(firstOption.getBoundingClientRect().top).toBeGreaterThanOrEqual(
        scroll.getBoundingClientRect().top,
      );
      await expect(firstOption.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        scroll.getBoundingClientRect().bottom,
      );
      await userEvent.keyboard("[Space]");
      await expect(firstOption).toBeChecked();
    });
    await step("結果: 下端の注文操作にもTabで到達し、選択を送信できる", async () => {
      for (let count = 0; count < 5 && document.activeElement !== add; count += 1) {
        await userEvent.tab();
      }
      await expect(add).toHaveFocus();
      await userEvent.keyboard("[Enter]");
      await expect(saveLongProduct).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: product.id,
          quantity: 1,
          selections: [{ optionId: "tablecast-glass", quantity: 1 }],
        }),
      );
    });
  },
};
export const Basket: Story = {
  name: "変更内容と合計を表示",
  render: () => <CartLines lines={table.cart.lines} onEdit={fn()} onRemove={fn()} />,
};
export const Incomplete: Story = {
  name: "必須選択が未完了",
  render: () => (
    <CartLines
      lines={table.cart.lines.map((line) => ({ ...line, missing: ["tablecast-serving"] }))}
      onEdit={fn()}
    />
  ),
};
