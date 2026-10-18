import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Badge } from "./badge";
const meta = {
  title: "デザインシステム/部品/Badge",
  component: Badge,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      <Badge>公開中</Badge>
      <Badge variant="success">確認済み</Badge>
      <Badge variant="inactive">終了</Badge>
      <Badge variant="destructive">要対応</Badge>
      <Badge variant="outline">下書き</Badge>
    </div>
  ),
};
export const 英語: Story = {
  args: { children: "Published", variant: "success" },
  globals: { locale: "en" },
};
