import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Skeleton } from "./skeleton";
const meta = {
  title: "デザインシステム/部品/Skeleton",
  component: Skeleton,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <div aria-hidden="true" className="max-w-sm space-y-3">
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-24 w-full" />
    </div>
  ),
};
