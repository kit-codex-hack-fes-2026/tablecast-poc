import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { EvaluationGuide } from "./evaluation-guide";

const meta = {
  title: "導入/評価ガイド",
  component: EvaluationGuide,
} satisfies Meta<typeof EvaluationGuide>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = { name: "日本語" };
export const English: Story = { name: "英語", globals: { locale: "en" } };
