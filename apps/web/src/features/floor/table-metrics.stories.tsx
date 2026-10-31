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
          "営業中の卓と要対応の件数。狭幅は4つを1段に揃え、アイコンと件数を上段、名称を下段へ置く。広幅は名称を上段、件数を下段へ置く。名称は意味のまとまりを保って折り返す。onFilterChangeがある場合だけ押せる面を使い、矢印は広幅で添える。読込中も同じ領域を保つ。",
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
