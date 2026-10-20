import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { useState } from "react";
import { MonthPicker } from "./month-picker";
const meta = {
  title: "共通/月選択",
  component: MonthPicker,
  tags: ["autodocs"],
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Base UI Popoverで年と月を選ぶ。value/onChangeはYYYY-MM、表示はアプリの言語に従う。labelは必須。選択月へfocusを置き、Escapeまたは月の選択で閉じてトリガーへ戻す。",
      },
    },
  },
  args: { value: "2026-10", label: "利用状況の対象月", onChange: () => {} },
  render: function Example(args) {
    const [value, setValue] = useState(args.value);
    return <MonthPicker {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof MonthPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = {};
export const English: Story = { globals: { locale: "en" }, args: { label: "Usage month" } };
