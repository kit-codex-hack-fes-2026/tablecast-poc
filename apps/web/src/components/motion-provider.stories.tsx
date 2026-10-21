import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, waitFor } from "storybook/test";
import { MotionProvider } from "./motion-provider";
import { ActionFeedback } from "./action-feedback";
const meta = {
  title: "共通表示/MotionProvider",
  component: MotionProvider,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { children: "" },
} satisfies Meta<typeof MotionProvider>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <MotionProvider>
      <ActionFeedback pending={false} error={null} success successMessage="保存しました" />
    </MotionProvider>
  ),
  play: async ({ canvas }) => {
    // 入場後の面と文字を対象に、axeでコントラストを検査する。
    await waitFor(() => expect(canvas.getByText("保存しました")).toHaveStyle({ opacity: "1" }));
  },
};
