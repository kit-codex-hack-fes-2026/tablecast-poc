import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CartLine } from "@tablecast/api/schema";
import { expect, fn, userEvent, within } from "storybook/test";
import { catalog, product, table } from "../../../.storybook/tablecast-fixtures";
import { CartLines, ProductDialog, ProductMenu } from "./menu";

const meta = {
  title: "客向け/メニューと注文",
  component: ProductMenu,
  decorators: [
    (Story) => (
      <div className="menu-panel" style={{ maxWidth: 430, paddingTop: 20 }}>
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
  render: () => <ProductDialog product={product} busy={false} onClose={fn()} onSave={fn()} />,
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
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
    <ProductDialog
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
