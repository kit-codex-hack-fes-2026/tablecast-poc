import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { NativeSelect } from "./native-select";
const meta = {
  title: "デザインシステム/部品/NativeSelect",
  component: NativeSelect,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
} satisfies Meta<typeof NativeSelect>;
export default meta;
type Story = StoryObj<typeof meta>;
export const 標準: Story = {
  render: () => (
    <label htmlFor="tablecast-period-example" className="grid max-w-sm gap-2">
      表示期間
      <NativeSelect id="tablecast-period-example" defaultValue="week">
        <option value="today">今日</option>
        <option value="week">直近7日</option>
        <option value="month">直近30日</option>
      </NativeSelect>
    </label>
  ),
};
