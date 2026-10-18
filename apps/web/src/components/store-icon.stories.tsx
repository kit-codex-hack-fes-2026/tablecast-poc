import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { StoreIcon } from "./store-icon";
const meta = {
  title: "共通表示/StoreIcon",
  component: StoreIcon,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { name: "こもれび" },
} satisfies Meta<typeof StoreIcon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <StoreIcon {...args} />
      <span>{args.name}</span>
    </div>
  ),
};
