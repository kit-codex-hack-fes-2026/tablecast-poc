import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { DateTime } from "./date-time";
const meta = {
  title: "共通表示/DateTime",
  component: DateTime,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { value: "2026-10-19T01:30:00Z" },
} satisfies Meta<typeof DateTime>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {};
export const 未取得: Story = { args: { value: null } };
export const 英語: Story = { globals: { locale: "en" } };
