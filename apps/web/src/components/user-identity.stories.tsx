import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, within } from "storybook/test";
import { ParticipantIdentity, UserIdentity } from "./user-identity";
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
  play: async ({ canvasElement, args }) => {
    if (!args.user.email) throw new Error("長いメールを持つ人物が必要です");
    const email = within(canvasElement).getByText(args.user.email);
    await expect(email).toBeVisible();
    await expect(email.scrollWidth).toBeLessThanOrEqual(email.clientWidth);
  },
  args: {
    user: {
      name: "Alexandra Catherine Smith",
      email: "alexandra.catherine.smith.restaurant.manager@example.test",
    },
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

export const メールを取得できない人物: Story = {
  args: { user: { name: "退会したスタッフ", email: null } },
};
export const 同席者: Story = {
  render: () => (
    <div className="space-y-4">
      <ParticipantIdentity name="佐藤 晴香" />
      <ParticipantIdentity name={null} />
    </div>
  ),
};
