import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { ProductMenu } from "./product-menu";
import { catalog } from "../../.storybook/tablecast-fixtures";
import { fn } from "storybook/test";
const meta = {
  title: "共通表示/ProductMenu",
  component: ProductMenu,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { catalog, onChoose: fn() },
} satisfies Meta<typeof ProductMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {};
export const 英語: Story = { globals: { locale: "en" } };
