import type { Meta, StoryObj } from "@storybook/react-vite";
import type { TableEvent } from "@tablecast/api/schema";
import { expect, within } from "storybook/test";
import { ActivityLog } from "./events";

const cases: { kind: string; data: TableEvent["data"]; ja: string; en: string }[] = [
  { kind: "voice.proactive", data: {}, ja: "自発接客を開始", en: "Proactive service started" },
  { kind: "order.status", data: { status: "accepted" }, ja: "注文を受付", en: "Order accepted" },
  { kind: "order.status", data: { status: "served" }, ja: "商品を提供", en: "Order served" },
  { kind: "order.status", data: { status: "cancelled" }, ja: "注文を取消", en: "Order cancelled" },
  { kind: "order.status", data: { status: "rejected" }, ja: "注文を拒否", en: "Order rejected" },
  { kind: "billing.payment", data: { amount: 100 }, ja: "支払いを登録", en: "Payment recorded" },
  { kind: "billing.adjustment", data: { amount: 100 }, ja: "会計を調整", en: "Bill adjusted" },
  {
    kind: "configuration.published",
    data: { version: 2 },
    ja: "設定を公開",
    en: "Settings published",
  },
  { kind: "confirmation.prepared", data: {}, ja: "注文内容を確認", en: "Order reviewed" },
  { kind: "order.status", data: { status: "unknown" }, ja: "テーブルの更新", en: "Table updated" },
];
const meta = {
  title: "店舗/業務イベント",
  component: ActivityLog,
  args: {
    events: cases.map(({ kind, data }, index) => ({
      cursor: index + 1,
      storeId: "tablecast-story",
      tableSessionId: "tablecast-session",
      kind,
      data,
      createdAt: 1788645000000 + index * 1000,
    })),
  },
} satisfies Meta<typeof ActivityLog>;
export default meta;
type Story = StoryObj<typeof meta>;

async function verifyLabels(canvasElement: HTMLElement, locale: "ja" | "en") {
  const rows = within(canvasElement).getAllByRole("listitem");
  await expect(rows).toHaveLength(cases.length);
  for (const [index, row] of rows.entries()) {
    const example = cases[index];
    if (!example) throw new Error("対応する業務イベントがありません");
    await expect(within(row).getByText(example[locale], { exact: true })).toBeVisible();
  }
}
export const Japanese: Story = {
  name: "APIの業務イベントを日本語で表示",
  play: ({ canvasElement }) => verifyLabels(canvasElement, "ja"),
};
export const English: Story = {
  name: "APIの業務イベントを英語で表示",
  globals: { locale: "en" },
  play: ({ canvasElement }) => verifyLabels(canvasElement, "en"),
};

const datedEvents: TableEvent[] = ["2026-09-05T14:59:00Z", "2026-09-05T15:01:00Z"].map(
  (createdAt, index) => ({
    cursor: index + 1,
    storeId: "tablecast-story",
    tableSessionId: "tablecast-session",
    kind: "order.status",
    data: { status: "served" },
    createdAt: Date.parse(createdAt),
  }),
);
async function verifyDates(canvasElement: HTMLElement, locale: "ja" | "en") {
  const rows = within(canvasElement).getAllByRole("listitem");
  await expect(rows).toHaveLength(2);
  const expected =
    locale === "ja"
      ? [/2026.*9.*5.*23:59/, /2026.*9.*6.*0:01/]
      : [/5 Sep(?:t)? 2026.*23:59/, /6 Sep(?:t)? 2026.*00:01/];
  for (const [index, row] of rows.entries()) {
    const date = expected[index];
    if (!date) throw new Error("対応する履歴日時がありません");
    await expect(within(row).getByText(date)).toBeVisible();
  }
}
export const DatedJapanese: Story = {
  name: "閉卓履歴の日跨ぎを日本語の店舗日時で区別する",
  args: { events: datedEvents, includeDate: true },
  play: ({ canvasElement }) => verifyDates(canvasElement, "ja"),
};
export const DatedEnglish: Story = {
  ...DatedJapanese,
  name: "閉卓履歴の日跨ぎを英語の店舗日時で区別する",
  globals: { locale: "en" },
  play: ({ canvasElement }) => verifyDates(canvasElement, "en"),
};
