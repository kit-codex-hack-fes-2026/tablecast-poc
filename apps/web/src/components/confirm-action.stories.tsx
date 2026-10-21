import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { ConfirmAction } from "./confirm-action";
import { Trash2 } from "lucide-react";
import { fn, expect, userEvent, within, waitFor } from "storybook/test";
const meta = {
  title: "共通表示/ConfirmAction",
  component: ConfirmAction,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    label: "下書きを破棄",
    subject: "季節メニューの下書きを破棄します。公開中の内容は変わりません。",
    icon: <Trash2 aria-hidden="true" />,
    onConfirm: fn(),
  },
} satisfies Meta<typeof ConfirmAction>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole("button");
    await userEvent.click(trigger);
    const dialog = within(canvasElement.ownerDocument.body).getByRole("alertdialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    await expect(args.onConfirm).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.click(trigger);
    await userEvent.click(
      within(within(canvasElement.ownerDocument.body).getByRole("alertdialog")).getByRole(
        "button",
        { name: "下書きを破棄" },
      ),
    );
    await expect(args.onConfirm).toHaveBeenCalledTimes(1);
  },
};
