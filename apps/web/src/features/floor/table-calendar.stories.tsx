import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { product, table } from "../../../.storybook/tablecast-fixtures";
import { TableCalendar } from "./table-calendar";

const startAt = Date.parse("2026-09-15T00:00:00+09:00");
const hour = 3_600_000;
const current = {
  ...table,
  tableId: "tablecast-t03",
  tableName: "T03",
  bill: { ...table.bill, orderedTotal: table.cart.total, due: table.cart.total },
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
    await userEvent.click(canvas.getByRole("button", { name: "T03の利用履歴を開く（3件）" }));
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      within(body.getByRole("dialog")).getByRole("button", {
        name: /T03 · 1 名/,
      }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith("tablecast-short");
    const bill = body.getByText("会計待ち", { exact: true });
    bill.scrollIntoView({ block: "nearest" });
    await waitFor(async () => {
      await expect(bill).toBeVisible();
    });
    await userEvent.keyboard("{Escape}");
    const row = canvasElement.querySelector("[data-floor-row]");
    await expect(row?.getBoundingClientRect().height).toBe(64);
    await expect(canvasElement.querySelector("[data-floor-table]")?.textContent).toBe("T03");
  },
};
export const English: Story = {
  name: "英語・iPad",
  tags: ["!test"],
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

export const Dense: Story = {
  name: "12卓をコンパクトに見渡す",
  args: {
    tables: Array.from({ length: 12 }, (_, index) => ({
      ...current,
      id: `tablecast-visit-${index}`,
      tableId: `tablecast-table-${index}`,
      tableName: `T${String(index + 1).padStart(2, "0")}`,
      guestCount: (index % 5) + 1,
      locale: index === 0 ? "en" : "ja",
      plan:
        index < 3
          ? {
              id: `tablecast-plan-${index}`,
              startedAt: startAt + 12 * hour - (index === 0 ? 60 : index === 1 ? 80 : 100) * 60_000,
              rules: {
                id: "tablecast-plan",
                text: {
                  ja: { ...product.text.ja, displayName: "90分飲み放題" },
                  en: { ...product.text.en, displayName: "90-minute drinks plan" },
                },
                pricePerPerson: 2000,
                durationMinutes: 90,
                lastOrderMinutesBeforeEnd: 15,
                productIds: [],
                categoryIds: [],
                tags: [],
                maxPerOrder: 5,
                maxTotalPerPerson: 20,
                intervalSeconds: 0,
                excludedOptionIds: [],
                includedOptionSurcharge: false,
              },
            }
          : null,
      openedAt: startAt + (8 + index / 4) * hour,
      staffCalled: index === 0,
      billRequested: index === 1,
      voiceState: index === 2 ? "error" : "stopped",
    })),
    vacantTables: [],
    sessions: Array.from({ length: 12 }, (_, index) => ({
      id: `tablecast-visit-${index}`,
      tableId: `tablecast-table-${index}`,
      guestCount: (index % 5) + 1,
      status: "open",
      openedAt: startAt + (8 + index / 4) * hour,
      closedAt: null,
    })),
  },
};
