import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, within } from "storybook/test";
import { configurationHistoryFixture } from "../../../.storybook/tablecast-fixtures";
import { ConfigurationTimeline } from "./configuration-timeline";

const meta = {
  title: "店舗/公開履歴",
  component: ConfigurationTimeline,
  parameters: {
    docs: {
      description: {
        component:
          "公開版と保存済み下書きの関係を時系列で読む一覧。entriesはAPIの取得済みメタデータだけを渡し、保存されていない作成元は補わない。publishedVersionは現在公開中の版。onSelectで公開版の詳細を開く。下書きは既存の変更確認へリンクし、線や色に依存せず関係と状態を本文にも示す。",
      },
    },
  },
  args: {
    entries: configurationHistoryFixture.entries,
    publishedVersion: 2,
    storeId: "tablecast-store",
    onSelect: fn(),
  },
  decorators: [
    (Story) => (
      <div className="p-6">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ConfigurationTimeline>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = {
  name: "日本語・公開版と下書き",
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("現在公開中")).toBeVisible();
  },
};
export const English: Story = { name: "英語", globals: { locale: "en" } };
export const Restored: Story = {
  name: "過去版からの下書き",
  args: {
    entries: [
      {
        kind: "draft",
        id: "tablecast-restored-draft",
        version: 1,
        baseVersion: 2,
        sourceDraftId: null,
        restoredFromVersion: 1,
        status: "draft",
        at: 1792357300000,
        actorId: "tablecast-staff",
        actorName: null,
        actorEmail: null,
        actorImage: null,
      },
      ...configurationHistoryFixture.entries,
    ],
  },
};
export const Narrow: Story = {
  name: "狭い画面・長い名前",
  decorators: [
    (Story) => (
      <div className="max-w-80">
        <Story />
      </div>
    ),
  ],
  args: {
    entries: configurationHistoryFixture.entries.map((entry) => ({
      ...entry,
      actorName: "TableCast Restaurant Operations Administrator",
      actorEmail: "staff@example.test",
      actorImage: null,
    })),
  },
};
