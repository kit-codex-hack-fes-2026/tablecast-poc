import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { table } from "../../../.storybook/tablecast-fixtures";
import { TableTimeline } from "./table-timeline";

const meta = {
  title: "店舗/卓タイムライン",
  component: TableTimeline,
  args: {
    tables: [
      table,
      {
        ...table,
        id: "tablecast-english",
        tableName: "T04",
        locale: "en",
        voiceState: "error",
        staffCalled: false,
      },
    ],
    onSelect: fn(),
  },
} satisfies Meta<typeof TableTimeline>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Attention: Story = {
  name: "要対応と音声異常",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /T03/ }));
    await expect(args.onSelect).toHaveBeenCalledWith(table.id);
  },
};
export const EnglishStaff: Story = {
  name: "店側英語と客側日本語が共存",
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("columnheader", { name: "Guest language" })).toBeInTheDocument();
    await expect(canvas.getByText("日本語")).toBeInTheDocument();
  },
};
export const Empty: Story = { name: "まだ卓がない状態", args: { tables: [] } };

const now = 1788650400000;
const recentTable = {
  ...table,
  openedAt: now - 90 * 60_000,
  staffCalled: false,
  events: [
    {
      cursor: 105,
      storeId: table.storeId,
      tableSessionId: table.id,
      kind: "cart.updated",
      data: {},
      createdAt: now - 2 * 60_000,
    },
  ],
  cursor: 105,
};
export const BeyondRecentEvents: Story = {
  name: "表示ログに開卓と会計依頼がなくても経過時間と優先順を保つ",
  beforeEach: () => {
    const clock = Date.now;
    Date.now = () => now;
    return () => {
      Date.now = clock;
    };
  },
  args: {
    tables: [
      { ...recentTable, id: "tablecast-error", tableName: "T01", voiceState: "error" },
      { ...recentTable, id: "tablecast-billing", tableName: "T02", billRequested: true },
      { ...recentTable, id: "tablecast-called", tableName: "T03", staffCalled: true },
      {
        ...recentTable,
        id: "tablecast-paid",
        tableName: "T04",
        billRequested: true,
        bill: { ...table.bill, paidTotal: 1500, due: 0 },
      },
    ],
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    await step("結果: 2分前の表示ログではなく90分前の開卓から数える", async () => {
      const pending = within(canvas.getByRole("row", { name: /T02/ }));
      await expect(pending.getByRole("cell", { name: "90 分" })).toBeInTheDocument();
    });
    await step("結果: 要対応・未精算の会計依頼・音声異常・精算済みの順に並ぶ", async () => {
      await expect(
        canvas
          .getAllByRole("row")
          .slice(1)
          .map((row) => within(row).getByRole("button", { name: /^T0/ }).textContent),
      ).toEqual(["T032 名", "T022 名", "T012 名", "T042 名"]);
    });
  },
};
