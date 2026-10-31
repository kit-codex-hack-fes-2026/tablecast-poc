import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Landing } from "./landing";

const meta = {
  title: "導入/ランディングページ",
  component: Landing,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Landing>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = { name: "日本語" };
export const English: Story = { name: "英語", globals: { locale: "en" } };
