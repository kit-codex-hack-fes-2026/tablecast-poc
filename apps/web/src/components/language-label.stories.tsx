import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { LanguageLabel } from "./language-label";

const meta = {
  title: "共通/言語表示",
  component: LanguageLabel,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "flag-iconsとその言語の名称を併記する。localeにja/enを渡す。国籍を示す用途には使わない。表示のみで、切替操作にはLanguageSwitchを使う。旗は装飾扱いにして支援技術で重複読み上げしない。",
      },
    },
  },
  args: { locale: "ja" },
} satisfies Meta<typeof LanguageLabel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = { name: "日本語" };
export const English: Story = { name: "English", args: { locale: "en" } };
