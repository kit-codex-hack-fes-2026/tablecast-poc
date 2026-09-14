import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Brand } from "./brand";

const meta = {
  title: "共通表示/ブランド",
  component: Brand,
  parameters: { layout: "centered" },
} satisfies Meta<typeof Brand>;
export default meta;
type Story = StoryObj<typeof meta>;

export const 黒: Story = {
  render: () => (
    <div className="flex items-center gap-8 bg-white p-8">
      <Brand />
      <Brand variant="symbol" />
    </div>
  ),
};

export const 白: Story = {
  render: () => (
    <div className="flex items-center gap-8 bg-zinc-950 p-8">
      <Brand tone="white" />
      <Brand variant="symbol" tone="white" />
    </div>
  ),
};
