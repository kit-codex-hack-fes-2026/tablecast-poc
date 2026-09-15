import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, within } from "storybook/test";
import { ConfigurationStatus } from "./configuration-status";

const meta = {
  title: "店舗/設定の版と保存状態",
  component: ConfigurationStatus,
  args: {
    storeName: "京料理 TableCast",
    publishedVersion: 12,
    draft: { id: "tablecast-draft-185", baseVersion: 12, version: 4, status: "draft" },
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConfigurationStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Saved: Story = {
  name: "保存済みの下書きと二種類の版",
  play: async ({ canvasElement }) => {
    const status = within(canvasElement).getByRole("status");
    await expect(status).toHaveTextContent("現在公開版 12");
    await expect(status).toHaveTextContent("下書き更新番号 4");
    await expect(status).toHaveTextContent("保存済み・未検証");
  },
};
export const Dirty: Story = { name: "未保存", args: { dirty: true } };
export const Saving: Story = { name: "保存中", args: { dirty: true, pending: true } };
export const Failed: Story = {
  name: "失敗時も入力を保持",
  args: { dirty: true, error: new TypeError("network") },
};
export const Ready: Story = {
  name: "検証済み未公開",
  args: { draft: { ...meta.args.draft, status: "ready" } },
};
export const Published: Story = {
  name: "公開済み",
  args: { publishedVersion: 13, draft: { ...meta.args.draft, status: "published" } },
};
export const Discarded: Story = {
  name: "破棄済み",
  args: { draft: { ...meta.args.draft, status: "discarded" } },
};
export const English: Story = {
  name: "英語の公開版",
  globals: { locale: "en" },
  args: { draft: undefined },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent(
      "Published version 12",
    );
  },
};
