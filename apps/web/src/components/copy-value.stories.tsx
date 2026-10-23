import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { CopyValue } from "./copy-value";
const meta = {
  title: "共通表示/CopyValue",
  component: CopyValue,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { label: "接続先", value: "https://example.test/mcp" },
} satisfies Meta<typeof CopyValue>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {};
