import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { product } from "../../.storybook/tablecast-fixtures";
import { ConditionSummary } from "./condition-summary";
const meta = {
  title: "共通表示/ConditionSummary",
  component: ConditionSummary,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { expression: { kind: "option", optionId: "tablecast-komorebi-serving-glass" }, product },
} satisfies Meta<typeof ConditionSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {};
export const 英語: Story = { globals: { locale: "en" } };
