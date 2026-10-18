import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { RoleBadge } from "./role-badge";
const meta = {
  title: "共通表示/RoleBadge",
  component: RoleBadge,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { role: "owner" },
} satisfies Meta<typeof RoleBadge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {["owner", "admin", "member"].map((role) => (
        <RoleBadge key={role} role={role} />
      ))}
    </div>
  ),
};
