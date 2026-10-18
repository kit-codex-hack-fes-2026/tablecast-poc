import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { CartLines } from "./cart-lines";
import { table, catalog } from "../../.storybook/tablecast-fixtures";
import { fn } from "storybook/test";
const meta = {
  title: "共通表示/CartLines",
  component: CartLines,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    lines: table.cart.lines,
    products: catalog.configuration.products,
    onEdit: fn(),
    onRemove: fn(),
    onQuantity: fn(),
  },
} satisfies Meta<typeof CartLines>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {};
export const 空: Story = { args: { lines: [] } };
export const 表示のみ: Story = {
  args: { onEdit: undefined, onRemove: undefined, onQuantity: undefined },
};
export const 英語: Story = { globals: { locale: "en" } };
