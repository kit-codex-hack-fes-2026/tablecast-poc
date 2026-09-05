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
