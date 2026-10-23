import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StoreTheme } from "./store-theme";
import { Button } from "./ui/button";
const meta = {
  title: "共通表示/StoreTheme",
  component: StoreTheme,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { children: "標準テーマ" },
} satisfies Meta<typeof StoreTheme>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <StoreTheme>
      <section className="space-y-3 rounded-xl border border-border bg-card p-6">
        <h2>TableCast 標準</h2>
        <p>店舗の情報が読みやすい、共通の操作と余白。</p>
        <Button>メニューを見る</Button>
      </section>
    </StoreTheme>
  ),
};
