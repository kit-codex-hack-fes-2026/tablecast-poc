import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Bell, Check, Mic, MicOff } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";
import { Badge } from "./badge";
import { Button } from "./button";
import { Input } from "./input";

const meta = {
  title: "デザインシステム/操作",
  component: Button,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 操作と状態: Story = {
  render: () => (
    <main className="grid gap-8 p-8 bg-background text-foreground">
      <h1>TableCast</h1>
      <section className="flex flex-wrap items-center gap-4">
        <Button size="lg">
          <Mic />
          音声を開始
        </Button>
        <Button variant="destructive" size="lg">
          <MicOff />
          音声を停止
        </Button>
        <Button variant="outline">
          <Bell />
          スタッフを呼ぶ
        </Button>
        <Button size="lg">
          <Check />
          注文を確定する
        </Button>
        <Button disabled>処理中</Button>
      </section>
      <section className="flex flex-wrap items-center gap-4">
        <Badge>受付済み</Badge>
        <Badge variant="secondary">提供済み</Badge>
        <Badge variant="outline">停止中</Badge>
        <Badge variant="destructive">要対応</Badge>
      </section>
      <label htmlFor="tablecast-design-email" className="grid max-w-sm gap-2">
        メールアドレス
        <Input id="tablecast-design-email" type="email" placeholder="staff@example.com" />
      </label>
    </main>
  ),
};
export const 英語の操作: Story = {
  render: () => (
    <main className="grid gap-8 p-8 bg-background text-foreground">
      <h1>TableCast</h1>
      <section className="flex flex-wrap items-center gap-4">
        <Button size="lg">
          <Mic />
          Start voice
        </Button>
        <Button variant="outline">
          <Bell />
          Call staff
        </Button>
        <Button size="lg">
          <Check />
          Confirm and place order
        </Button>
        <Button disabled>Processing</Button>
      </section>
    </main>
  ),
};

export const コンパクトな操作領域: Story = {
  render: () => (
    <main className="space-y-6 p-6">
      <h1>コンパクトな操作</h1>
      <div className="flex flex-wrap items-start gap-3">
        <Button size="xs">追加</Button>
        <Button size="sm" variant="outline">
          編集
        </Button>
        <Button size="text" variant="link">
          詳細
        </Button>
        <Button size="icon-xs" variant="outline" aria-label="小さい確認操作">
          <Check />
        </Button>
        <Button size="icon-sm" variant="outline" aria-label="確認操作">
          <Check />
        </Button>
        <Button size="icon-lg" variant="outline" aria-label="大きい確認操作">
          <Check />
        </Button>
      </div>
      <div data-slot="button-group" className="inline-flex items-stretch gap-px">
        <Button size="sm" variant="outline">
          戻る
        </Button>
        <Button size="sm" variant="outline">
          次へ
        </Button>
      </div>
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const button of canvas.getAllByRole("button")) {
      const bounds = button.getBoundingClientRect();
      await expect(bounds.width).toBeGreaterThanOrEqual(44);
      await expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    const back = canvas.getByRole("button", { name: "戻る" });
    const next = canvas.getByRole("button", { name: "次へ" });
    await expect(back.getBoundingClientRect().right).toBeLessThanOrEqual(
      next.getBoundingClientRect().left,
    );
    await userEvent.click(back);
    await userEvent.tab();
    await expect(next).toHaveFocus();
  },
};

export const 狭い領域の長い操作と状態: Story = {
  render: () => (
    <main className="w-64 max-w-full space-y-6 p-6">
      <h1 className="text-xl">Long labels</h1>
      <Button size="lg" className="w-full">
        <Check />
        Confirm changes to the restaurant menu and service settings
      </Button>
      <Badge variant="inactive">
        This menu change has been published and is available to all tables
      </Badge>
      <Badge
        variant="outline"
        render={<a href="#tablecast-design-status" aria-label="View published changes" />}
      >
        View published changes
      </Badge>
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const action = canvas.getByRole("button", { name: /Confirm changes/ });
    await expect(action.getBoundingClientRect().height).toBeGreaterThan(56);
    await expect(action.scrollWidth).toBeLessThanOrEqual(action.clientWidth);
    const status = canvas.getByText(/This menu change/);
    await expect(status.getBoundingClientRect().height).toBeGreaterThan(24);
    await expect(status.scrollHeight).toBeLessThanOrEqual(status.clientHeight);
    const link = canvas.getByRole("link", { name: "View published changes" });
    await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    await userEvent.click(action);
    await userEvent.tab();
    await expect(link).toHaveFocus();
  },
};
