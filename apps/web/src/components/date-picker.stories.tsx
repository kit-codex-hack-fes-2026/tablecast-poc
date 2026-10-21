import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { useState } from "react";
import { DatePicker } from "./date-picker";
import { DateTimePicker } from "./date-time-picker";

const meta = {
  title: "共通/日付選択",
  component: DatePicker,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Base UI Popoverのカレンダーと直接入力を併用する。保存値はYYYY-MM-DD、表示は日本語の年月日・曜日または英国英語の完全な日付。required/min/max/disabled/refはInputと同じ契約。矢印、Home/End、PageUp/Down、Shift+PageUp/Downで日・週・月・年を移動し、Escapeで入力へfocusを戻す。フォームではDateFieldを使用する。DateTimePickerは日付と24時間の時刻を近接配置し、既存の店舗時刻変換は送信元へ残す。",
      },
    },
  },
  args: { value: "2026-10-21", label: "開始日", onValueChange: () => {} },
  render: function Example(args) {
    const [value, setValue] = useState(args.value);
    return <DatePicker {...args} value={value} onValueChange={setValue} />;
  },
} satisfies Meta<typeof DatePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = {};
export const English: Story = { globals: { locale: "en" }, args: { label: "Start date" } };
export const RequiredRange: Story = {
  args: { min: "2026-10-01", max: "2026-10-31", required: true },
};
export const Disabled: Story = { args: { disabled: true } };
export const WithTime: Story = {
  args: { value: "2026-10-21T09:00", label: "開始日時" },
  render: function Example(args) {
    const [value, setValue] = useState(args.value);
    return <DateTimePicker {...args} value={value} onValueChange={setValue} />;
  },
};
