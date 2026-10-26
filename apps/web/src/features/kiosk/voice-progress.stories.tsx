import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { VoiceProgress } from "./voice-progress";
const meta = {
  title: "客向け/応答待ち",
  component: VoiceProgress,
  args: {
    view: {
      status: "thinking",
      progress: { stage: "searching", summary: "参考になる公開資料を確認しています。" },
    },
  },
} satisfies Meta<typeof VoiceProgress>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Searching: Story = { name: "日本語の検索と推論要約" };
export const English: Story = {
  name: "英語の検索と推論要約",
  globals: { locale: "en" },
  args: {
    view: {
      status: "thinking",
      progress: {
        stage: "searching",
        summary: "Checking public sources for helpful background information.",
      },
    },
  },
};
