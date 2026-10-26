import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { useState } from "react";
import { expect, fn, within } from "storybook/test";
import type { LiveMessage } from "./voice-model";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import { Button } from "../../components/ui/button";
import { VoicePanel } from "./voice-panel";

const meta = {
  title: "客向け/会話",
  component: VoicePanel,
  decorators: [
    (Story) => (
      <div className="h-160 max-w-2xl">
        <Story />
      </div>
    ),
  ],
  args: { view: { status: "idle" }, lines: [], onStart: fn() },
} satisfies Meta<typeof VoicePanel>;
export default meta;
type Story = StoryObj<typeof meta>;
import { Paused } from "./voice-panel.stories";
export const CompactDock: Story = {
  name: "狭い会話欄と縦画面の常設操作",
  args: {
    ...Paused.args,
    speechSpeed: 1,
    onSpeedChange: fn(),
    onMicrophoneChange: fn(),
    onMicrophoneRefresh: fn(),
  },
  decorators: [
    (Story) => (
      <div className="h-160 w-60 max-[56rem]:h-90 max-[56rem]:w-full">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "会話履歴を表示" })).not.toBeInTheDocument();
    await expect(canvas.getByText("この日本酒は温かくできますか？")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "声で相談・注文" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "カメラをオン" })).toBeVisible();
  },
};
export const CompactDockEnglish: Story = {
  ...CompactDock,
  name: "英語の狭い会話欄と常設操作",
  globals: { locale: "en" },
  tags: ["!test"],
  play: undefined,
};

export const ConversationUpdates: Story = {
  name: "会話の追加と字幕・ツールの更新",
  render: function ConversationUpdatesStory(args) {
    const [stage, setStage] = useState(0);
    const messages: LiveMessage[] =
      stage === 0
        ? []
        : [
            {
              id: "tablecast-motion-reply",
              turnId: "tablecast-motion-reply",
              role: "assistant",
              text:
                stage === 1
                  ? "すっきりした日本酒なら"
                  : "すっきりした日本酒なら、月凪がおすすめです。刺身によく合います。",
              createdAt: 1788645001000,
              final: stage === 3,
            },
          ];
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            onClick={() => setStage((current) => Math.min(3, current + 1))}
            disabled={stage === 3}
          >
            次の更新
          </Button>
          <Button variant="outline" onClick={() => setStage(0)}>
            最初に戻す
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <VoicePanel
            {...args}
            lines={Paused.args?.lines?.slice(0, 1) ?? []}
            view={{
              status: stage === 0 || stage === 3 ? "paused" : stage === 1 ? "thinking" : "speaking",
              messages,
            }}
            events={
              stage === 0
                ? []
                : [
                    {
                      cursor: 1,
                      storeId: catalog.storeId,
                      tableSessionId: "tablecast-session",
                      createdAt: 1788645000500,
                      kind: "voice.tool",
                      data: {
                        turnId: "tablecast-motion-reply",
                        toolCallId: "tablecast-motion-tool",
                        toolName: "getCatalog",
                        state: "running",
                      },
                    },
                    ...(stage === 3
                      ? [
                          {
                            cursor: 2,
                            storeId: catalog.storeId,
                            tableSessionId: "tablecast-session",
                            createdAt: 1788645002000,
                            kind: "voice.tool" as const,
                            data: {
                              turnId: "tablecast-motion-reply",
                              toolCallId: "tablecast-motion-tool",
                              toolName: "getCatalog",
                              state: "completed",
                            },
                          },
                        ]
                      : []),
                  ]
            }
          />
        </div>
      </div>
    );
  },
};
