import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, userEvent, within } from "storybook/test";
import { table } from "../../../.storybook/tablecast-fixtures";
import { TableCalendar } from "./table-calendar";

const startAt = Date.parse("2026-09-15T00:00:00+09:00");
const hour = 3_600_000;
const current = {
  ...table,
  tableId: "tablecast-t03",
  openedAt: startAt + 11 * hour,
  billRequested: true,
  voiceState: "error" as const,
};
const meta = {
  title: "店舗/卓別カレンダー",
  component: TableCalendar,
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
  args: {
    page: { date: "2026-09-15", startAt, endAt: startAt + 24 * hour },
    sessions: [
      {
        id: "tablecast-morning",
        tableId: "tablecast-t03",
        guestCount: 2,
        status: "closed",
        openedAt: startAt + 9 * hour,
        closedAt: startAt + 10 * hour,
      },
      {
        id: "tablecast-short",
        tableId: "tablecast-t03",
        guestCount: 1,
        status: "closed",
        openedAt: startAt + 10 * hour,
        closedAt: startAt + 10 * hour + 30_000,
      },
      {
        id: current.id,
        tableId: "tablecast-t03",
        guestCount: 4,
        status: "open",
        openedAt: current.openedAt,
        closedAt: null,
      },
      {
        id: "tablecast-across",
        tableId: "tablecast-t04",
        guestCount: 3,
        status: "closed",
        openedAt: startAt - hour,
        closedAt: startAt + 24 * hour + hour,
      },
    ],
    now: startAt + 12 * hour,
    tables: [current],
    vacantTables: [
      { id: "tablecast-t04", name: "T04" },
      { id: "tablecast-t05", name: "T05" },
    ],
    onSelect: fn(),
    onOpen: fn(),
  },
} satisfies Meta<typeof TableCalendar>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Day: Story = {
  name: "複数回来店・短時間・日跨ぎ・現在の要対応",
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("時刻・状態から来店を選ぶ"));
    await userEvent.click(
      within(canvas.getByRole("region", { name: "T03" })).getByRole("button", {
        name: /T03 · 1 名/,
      }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith("tablecast-short");
    await expect(canvas.getByText("会計待ち", { exact: true })).toBeVisible();
  },
};
export const English: Story = {
  name: "英語・iPad",
  globals: { locale: "en" },
  parameters: { viewport: { defaultViewport: "ipad" } },
};
export const Empty: Story = {
  name: "全卓が空席・来店なし",
  args: { sessions: [], tables: [], vacantTables: [{ id: "tablecast-t01", name: "T01" }] },
};
export const Partial: Story = {
  name: "取得上限と未取得の来店",
  args: { sessions: [], partial: true },
};
export const Past: Story = {
  name: "過去日に現在の注意状態を重ねない",
  args: { now: startAt + 48 * hour },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByLabelText("音声異常")).not.toBeInTheDocument();
  },
};
