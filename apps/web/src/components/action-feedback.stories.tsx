import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { ActionFeedback } from "./action-feedback";
const meta = {
  title: "共通表示/ActionFeedback",
  component: ActionFeedback,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { pending: false, error: null, success: true, successMessage: "変更を保存しました" },
} satisfies Meta<typeof ActionFeedback>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {};
export const 処理中: Story = { args: { pending: true, success: false } };
export const 失敗: Story = { args: { error: new TypeError("通信失敗"), success: false } };
export const 英語: Story = { args: { successMessage: "Changes saved" }, globals: { locale: "en" } };
