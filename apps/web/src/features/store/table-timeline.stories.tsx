import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, userEvent, within } from "storybook/test";
import { table } from "../../../.storybook/tablecast-fixtures";
import { TableTimeline } from "./table-timeline";

const meta = {
  title: "店舗/卓タイムライン",
  component: TableTimeline,
  beforeEach: () => {
    const clock = Date.now;
    Date.now = () => table.openedAt + 90 * 60_000;
    return () => {
      Date.now = clock;
    };
  },
  args: {
    initialNow: table.openedAt + 90 * 60_000,
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
    await expect(canvas.getAllByText("Occupied")[0]).toBeInTheDocument();
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
    initialNow: now,
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
      const item = canvas.getByRole("button", { name: /T02/ }).closest("li");
      if (!item) throw new Error("会計待ちの卓が必要です");
      const pending = within(item);
      await expect(pending.getByText("90 分", { exact: true })).toBeInTheDocument();
    });
    await step("結果: 要対応・未精算の会計依頼・音声異常・精算済みの順に並ぶ", async () => {
      await expect(
        canvas.getAllByRole("listitem").map((row) => within(row).getByRole("heading").textContent),
      ).toEqual(["T03", "T02", "T01", "T04"]);
    });
  },
};

export const OperationalStates: Story = {
  name: "呼出・会計待ち・利用中・空卓",
  args: {
    tables: [
      table,
      {
        ...table,
        id: "tablecast-billing",
        tableName: "T04",
        staffCalled: false,
        billRequested: true,
      },
      {
        ...table,
        id: "tablecast-dining",
        tableName: "T05",
        staffCalled: false,
        billRequested: false,
      },
    ],
    vacantTables: [{ id: "tablecast-vacant", name: "T06" }],
    onOpen: fn(),
  },
};
