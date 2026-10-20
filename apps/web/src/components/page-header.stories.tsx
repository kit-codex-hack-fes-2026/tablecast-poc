import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Plus, UtensilsCrossed } from "lucide-react";
import { expect, within } from "storybook/test";
import { PageHeader } from "./page-header";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

const meta = {
  tags: ["autodocs"],

  title: "デザインシステム/ページ見出し",
  component: PageHeader,
  decorators: [
    (Story) => (
      <main className="p-6">
        <Story />
      </main>
    ),
  ],
  args: { title: "商品", icon: <UtensilsCrossed /> },
} satisfies Meta<typeof PageHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const 一覧と操作: Story = {
  args: {
    title: "商品",
    description: "商品名から詳細を確認し、下書きで変更を編集できます。",
    status: <Badge variant="outline">編集中</Badge>,
    actions: (
      <Button>
        <Plus />
        商品を追加
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 1, name: /^商品$/ })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "商品を追加" })).toBeVisible();
    await expect(canvas.getByText("編集中", { exact: true })).toBeVisible();
  },
};

export const 英語の長い対象名: Story = {
  globals: { locale: "en" },
  args: {
    title: "Komorebi seasonal tasting menu with a selection of local ingredients",
    description: "Review the product details before editing this draft.",
    status: <Badge variant="outline">Draft</Badge>,
    actions: <Button variant="outline">Review changes</Button>,
  },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const heading = canvas.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Review changes" })).toBeVisible();
    await expect(heading.getBoundingClientRect().width).toBeLessThanOrEqual(
      canvasElement.clientWidth,
    );
  },
};
