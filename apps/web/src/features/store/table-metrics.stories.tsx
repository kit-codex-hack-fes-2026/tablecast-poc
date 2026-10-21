import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { fn } from "storybook/test";
import { table } from "../../../.storybook/tablecast-fixtures";
import { TableMetrics } from "./table-metrics";

const meta = {
  title: "店舗/フロアの状態指標",
  component: TableMetrics,
  parameters: {
    docs: {
      description: {
        component:
          "営業中の卓と要対応の件数。名称とアイコンを上段、件数と絞り込みの入口を下段に揃え、狭幅でも状態の名称を語中で折らない。onFilterChangeがある場合だけ押せる面と矢印を表示する。読込中も同じ領域を保つ。",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-97.5 p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    tables: [{ ...table, staffCalled: true, voiceState: "error" }],
    vacantCount: 2,
    filter: "all",
    onFilterChange: fn(),
  },
} satisfies Meta<typeof TableMetrics>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Japanese: Story = { name: "390px・日本語" };
export const English: Story = { name: "390px・英語", globals: { locale: "en" } };
export const Pending: Story = { name: "読込中も同じ配置", args: { pending: true } };
export const Static: Story = { name: "操作しない指標", args: { onFilterChange: undefined } };
