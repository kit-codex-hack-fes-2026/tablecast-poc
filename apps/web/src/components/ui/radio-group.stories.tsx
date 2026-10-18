import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import { expect, userEvent, within } from "storybook/test";
const meta = {
  title: "デザインシステム/部品/RadioGroup",
  component: RadioGroupItem,
  args: { value: "ja" },
  subcomponents: { RadioGroup },
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof RadioGroupItem>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <fieldset>
      <legend id="tablecast-radio-label">メニューの言語</legend>
      <RadioGroup aria-labelledby="tablecast-radio-label" defaultValue="ja">
        <label htmlFor="tablecast-radio-ja" className="flex min-h-11 items-center gap-3">
          <RadioGroupItem id="tablecast-radio-ja" value="ja" />
          日本語
        </label>
        <label htmlFor="tablecast-radio-en" className="flex min-h-11 items-center gap-3">
          <RadioGroupItem id="tablecast-radio-en" value="en" />
          English
        </label>
      </RadioGroup>
    </fieldset>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "日本語" }));
    await userEvent.keyboard("{ArrowDown}");
    await expect(canvas.getByRole("radio", { name: "English" })).toBeChecked();
  },
};
