import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, userEvent, within } from "storybook/test";
import { LanguageSwitch } from "./language-switch";

const meta = {
  tags: ["autodocs"],

  title: "共通/言語切替",
  component: LanguageSwitch,
  parameters: {
    layout: "centered",
  },
  args: { onChange: fn() },
} satisfies Meta<typeof LanguageSwitch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Languages: Story = {
  name: "日英を直接選択",
  play: async ({ canvasElement, args, globals }) => {
    const canvas = within(canvasElement);
    const english = globals.locale === "en";
    await expect(
      canvas.getByRole("button", { name: english ? "English" : "日本語" }),
    ).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(canvas.getByRole("button", { name: english ? "日本語" : "English" }));
    await expect(args.onChange).toHaveBeenCalledWith(english ? "ja" : "en");
  },
};
export const English: Story = {
  ...Languages,
  name: "英語から日本語を選択",
  tags: ["!test"],
  globals: { locale: "en" },
};
export const Disabled: Story = { name: "言語を更新中", args: { disabled: true } };

export const AdditionalLanguageIcons: Story = {
  name: "追加言語の国旗を文字なしで並べる",
  args: { availableLanguages: ["ja", "en", "zh-Hans", "ko", "fr"] },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("combobox");
    await expect(trigger.querySelectorAll("img")).toHaveLength(3);
    await expect(
      [...trigger.querySelectorAll("span[lang]")].map((item) => item.getAttribute("lang")),
    ).toEqual(["zh-Hans", "ko", "fr"]);
    for (const text of trigger.querySelectorAll("span[lang] > span"))
      await expect(text).toHaveClass("sr-only");
    await userEvent.click(trigger);
    await userEvent.click(
      await within(canvasElement.ownerDocument.body).findByRole("option", { name: "한국어" }),
    );
    await expect(args.onChange).toHaveBeenCalledWith("ko");
  },
};
