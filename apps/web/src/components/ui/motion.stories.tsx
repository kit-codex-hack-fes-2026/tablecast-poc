import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useId, useState } from "react";
import { X } from "lucide-react";
import { waitFor, expect, userEvent, within } from "storybook/test";
import { useI18n } from "../../i18n/locale";
import { ActionFeedback } from "../action-feedback";
import { Button } from "./button";
import { Checkbox } from "./checkbox";
import { Dialog, DialogClose, DialogContent, DialogHeader, DialogTitle } from "./dialog";
import * as Disclosure from "./disclosure";
import { Input } from "./input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import * as Tabs from "./tabs";

function MotionExamples() {
  const id = useId();
  const { locale } = useI18n();
  const english = locale === "en";
  const [result, setResult] = useState("idle");
  const labels = english
    ? {
        save: "Save",
        pending: "Start saving",
        success: "Complete",
        error: "Fail",
        open: "Review changes",
        close: "Close",
        details: "Product details",
        name: "Product name",
        locale: "Language",
        enabled: "Available",
        saved: "Changes saved",
      }
    : {
        save: "保存",
        pending: "保存を開始",
        success: "完了",
        error: "失敗",
        open: "変更を確認",
        close: "閉じる",
        details: "商品の詳細",
        name: "商品名",
        locale: "言語",
        enabled: "販売する",
        saved: "保存しました",
      };
  return (
    <div className="grid max-w-3xl gap-6 p-4">
      <section className="space-y-4 rounded-2xl bg-card p-5 shadow-surface">
        <h2 className="text-lg font-semibold">
          {english ? "Actions and selection" : "操作と選択"}
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{labels.save}</Button>
          <Button variant="outline">{labels.open}</Button>
          <Button variant="destructive">{english ? "Delete" : "削除"}</Button>
          <label className="flex min-h-11 items-center gap-2">
            <Checkbox />
            {labels.enabled}
          </label>
        </div>
        <Select
          defaultValue="ja"
          items={[
            { value: "ja", label: "日本語" },
            { value: "en", label: "English" },
          ]}
        >
          <SelectTrigger aria-label={labels.locale}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ja">日本語</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </section>
      <section className="space-y-4 rounded-2xl bg-card p-5 shadow-surface">
        <h2 className="text-lg font-semibold">
          {english ? "Tabs and disclosure" : "表示の切り替え"}
        </h2>
        <Tabs.Root defaultValue="ja">
          <Tabs.List
            aria-label={labels.locale}
            className="mb-4 flex gap-1 [&_button]:min-h-11 [&_button]:rounded-lg [&_button]:px-4 [&_button[data-active]]:bg-control-selected"
          >
            <Tabs.Tab value="ja">日本語</Tabs.Tab>
            <Tabs.Tab value="en">English</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="ja" keepMounted>
            <label htmlFor={`${id}-ja`} className="grid gap-2">
              商品名
              <Input id={`${id}-ja`} defaultValue="季節の御膳" />
            </label>
          </Tabs.Panel>
          <Tabs.Panel value="en" keepMounted>
            <label htmlFor={`${id}-en`} className="grid gap-2">
              Product name
              <Input id={`${id}-en`} defaultValue="Seasonal set meal" />
            </label>
          </Tabs.Panel>
        </Tabs.Root>
        <Disclosure.Root>
          <Disclosure.Trigger>{labels.details}</Disclosure.Trigger>
          <Disclosure.Panel>
            <label htmlFor={`${id}-detail`} className="grid gap-2 p-3">
              {labels.name}
              <Input
                id={`${id}-detail`}
                defaultValue={english ? "Seasonal set meal" : "季節の御膳"}
              />
            </label>
          </Disclosure.Panel>
        </Disclosure.Root>
      </section>
      <section className="space-y-4 rounded-2xl bg-card p-5 shadow-surface">
        <h2 className="text-lg font-semibold">{english ? "Progress and result" : "進行と結果"}</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setResult("pending")}>
            {labels.pending}
          </Button>
          <Button variant="outline" onClick={() => setResult("success")}>
            {labels.success}
          </Button>
          <Button variant="outline" onClick={() => setResult("error")}>
            {labels.error}
          </Button>
        </div>
        <ActionFeedback
          pending={result === "pending"}
          success={result === "success"}
          error={result === "error" ? new TypeError("network") : null}
          successMessage={labels.saved}
        />
        <Dialog>
          <DialogPrimitive.Trigger render={<Button />}>{labels.open}</DialogPrimitive.Trigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{labels.open}</DialogTitle>
              <DialogClose aria-label={labels.close}>
                <X />
              </DialogClose>
            </DialogHeader>
            <label htmlFor={`${id}-dialog`} className="grid gap-2">
              {labels.name}
              <Input
                id={`${id}-dialog`}
                defaultValue={english ? "Seasonal set meal" : "季節の御膳"}
              />
            </label>
          </DialogContent>
        </Dialog>
      </section>
    </div>
  );
}

const meta = {
  title: "デザインシステム/動き",
  component: MotionExamples,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "押下120ms、hover150ms、Menu/Popover180ms、Dialog220ms、状態切替200ms。操作の識別・状態変化を助ける箇所だけを動かす。移動・拡縮・反復はprefers-reduced-motionで停止し、入力とfocusを維持する。",
      },
    },
  },
} satisfies Meta<typeof MotionExamples>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^保存を開始$/ }));
    await userEvent.click(canvas.getByRole("button", { name: /^失敗$/ }));
    await waitFor(async () => {
      await expect(canvas.getByRole("alert")).toBeVisible();
    });
    await userEvent.click(canvas.getByRole("button", { name: /^完了$/ }));
    await expect(canvas.getByRole("status")).toHaveTextContent("保存しました");
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};
export const 英語: Story = { globals: { locale: "en" } };
export const 狭幅: Story = {
  render: () => (
    <div className="max-w-[390px]">
      <MotionExamples />
    </div>
  ),
};
