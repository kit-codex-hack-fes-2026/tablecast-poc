import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Dialog as Primitive } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
  DialogScroll,
  DialogFooter,
} from "./dialog";
import { expect, userEvent, within, waitFor } from "storybook/test";
const meta = {
  title: "デザインシステム/部品/DialogContent",
  component: DialogContent,
  subcomponents: {
    Dialog,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogClose,
    DialogScroll,
    DialogFooter,
  },
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof DialogContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <Dialog>
      <Primitive.Trigger render={<Button />}>詳細を開く</Primitive.Trigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>注文の確認</DialogTitle>
          <DialogClose aria-label="閉じる">
            <X />
          </DialogClose>
        </DialogHeader>
        <DialogDescription>内容を確認してから操作してください。</DialogDescription>
        <DialogScroll>
          <p>季節の御膳 2点</p>
        </DialogScroll>
        <DialogFooter>
          <Primitive.Close render={<Button variant="outline" />}>閉じる</Primitive.Close>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "詳細を開く" });
    await userEvent.click(trigger);
    await waitFor(async () => {
      await expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "注文の確認" }),
      ).toBeVisible();
    });
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
