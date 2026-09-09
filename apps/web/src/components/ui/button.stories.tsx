import type { Meta, StoryObj } from "@storybook/react-vite";
import { Bell, Check, Mic, MicOff } from "lucide-react";
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
