import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { UserIdentity } from "./user-identity";
const meta = {
  title: "共通表示/UserIdentity",
  component: UserIdentity,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { user: { name: "佐藤 晴香", email: "staff@example.test" } },
} satisfies Meta<typeof UserIdentity>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {};
export const 長い名前: Story = {
  args: {
    user: { name: "Alexandra Catherine Smith", email: "restaurant.manager@example.test" },
    compact: true,
  },
  decorators: [
    (Story) => (
      <div className="max-w-xs">
        <Story />
      </div>
    ),
  ],
};
