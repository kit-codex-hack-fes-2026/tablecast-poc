import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ClosedSessionSummary } from "@tablecast/api/schema";
import { expect, fn, userEvent, within } from "storybook/test";
import { VisitHistoryTable } from "./visit-history";

const sessions: ClosedSessionSummary[] = [
  {
    id: "tablecast-closed-visit",
    tableId: "tablecast-table-01",
    tableName: "T01",
    locale: "ja",
    guestCount: 2,
    openedAt: Date.UTC(2026, 8, 5, 14, 30),
    closedAt: Date.UTC(2026, 8, 5, 16, 0),
    bill: {
      orderedTotal: 3000,
      adjustmentTotal: -100,
      paidTotal: 2900,
      due: 0,
      cartTotal: 0,
      planTotal: 0,
    },
  },
];

const meta = {
  title: "店舗/来店履歴",
  component: VisitHistoryTable,
  args: { sessions, onSelect: fn() },
} satisfies Meta<typeof VisitHistoryTable>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Japanese: Story = {
  name: "日付をまたぐ来店と確定金額から詳細を開く",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("table")).toHaveTextContent("2,900");
    await expect(canvasElement.querySelectorAll("time")[0]).toHaveTextContent("2026/09/05");
    await expect(canvasElement.querySelectorAll("time")[1]).toHaveTextContent("2026/09/06");
    await userEvent.click(canvas.getByRole("button", { name: "テーブル詳細" }));
    await expect(args.onSelect).toHaveBeenCalledWith("tablecast-closed-visit");
  },
};
export const English: Story = {
  name: "来店日時と確定金額を英語で表示",
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("table")).toHaveTextContent("2,900");
    await expect(canvasElement.querySelectorAll("time")[0]).toHaveTextContent("05/09/2026");
    await expect(canvasElement.querySelectorAll("time")[1]).toHaveTextContent("06/09/2026");
    await expect(canvas.getByRole("table")).not.toHaveTextContent(/[\u3040-\u30ff\u4e00-\u9fff]/);
  },
};
