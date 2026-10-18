import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { LoadingState } from "./loading-state";
const meta = {
  title: "共通表示/LoadingState",
  component: LoadingState,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof LoadingState>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = { args: { cards: false } };
export const カード: Story = { args: { cards: true } };
export const 英語: Story = { globals: { locale: "en" } };
