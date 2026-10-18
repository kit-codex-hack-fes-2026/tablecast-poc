import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "./select";
import { expect, userEvent, within, waitFor } from "storybook/test";
const meta = {
  title: "デザインシステム/部品/SelectTrigger",
  component: SelectTrigger,
  subcomponents: { Select, SelectValue, SelectContent, SelectItem },
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof SelectTrigger>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <Select
      defaultValue="ja"
      items={[
        { label: "日本語", value: "ja" },
        { label: "English", value: "en" },
      ]}
    >
      <SelectTrigger aria-label="表示言語">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ja">日本語</SelectItem>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  ),
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("combobox");
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
