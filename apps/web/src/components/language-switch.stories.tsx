import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { LanguageSwitch } from "./language-switch";

const meta = {
  title: "共通/言語切替",
  component: LanguageSwitch,
  parameters: { layout: "centered" },
  args: { onChange: fn() },
} satisfies Meta<typeof LanguageSwitch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Languages: Story = {
  name: "日英を直接選択",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "日本語" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(canvas.getByRole("button", { name: "English" }));
    await expect(args.onChange).toHaveBeenCalledWith("en");
  },
};
export const Disabled: Story = { name: "言語を更新中", args: { disabled: true } };
