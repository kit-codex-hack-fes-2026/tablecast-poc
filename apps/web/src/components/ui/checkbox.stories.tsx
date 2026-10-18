import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Checkbox } from "./checkbox";
import { expect, userEvent, within } from "storybook/test";
const meta = {
  title: "デザインシステム/部品/Checkbox",
  component: Checkbox,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <label htmlFor="tablecast-checkbox-example" className="flex min-h-11 items-center gap-3">
      <Checkbox id="tablecast-checkbox-example" />
      メールで営業レポートを受け取る
    </label>
  ),
  play: async ({ canvasElement }) => {
    const control = within(canvasElement).getByRole("checkbox");
    await userEvent.click(control);
    await expect(control).toBeChecked();
    await userEvent.keyboard(" ");
    await expect(control).not.toBeChecked();
  },
};
