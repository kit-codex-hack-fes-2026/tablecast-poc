import type { Meta, StoryObj } from "@storybook/react-vite";
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
    await userEvent.click(body.getByRole("radio", { name: /90 mL/ }));
    await expect(body.getByRole("radio", { name: /90 mL/ })).toBeChecked();
    await expect(body.queryByRole("textbox")).not.toBeInTheDocument();
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
