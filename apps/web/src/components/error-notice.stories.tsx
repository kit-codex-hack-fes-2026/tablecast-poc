import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ErrorNotice } from "./error-notice";
const meta = {
  title: "共通表示/ErrorNotice",
  component: ErrorNotice,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: { error: new TypeError("通信失敗"), onRetry: fn() },
} satisfies Meta<typeof ErrorNotice>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await waitFor(async () => {
      await expect(canvas.getByRole("alert")).toBeVisible();
    });
    await userEvent.click(canvas.getByRole("button"));
    await expect(args.onRetry).toHaveBeenCalled();
  },
};
export const 再取得中: Story = { args: { retrying: true } };
export const 英語: Story = { globals: { locale: "en" } };
