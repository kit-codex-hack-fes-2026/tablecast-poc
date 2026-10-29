import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { useEffect, useState } from "react";
import { expect, fn, within } from "storybook/test";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import { KioskVoicePanel } from "./kiosk-voice-panel";
import { VoiceConnection } from "./voice-connection";
import { VoicePanel } from "./voice-panel";
const meta = {
  title: "客向け/呼び出し待受",
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
export const LocalStandbyOff: Story = {
  name: "声と動作の待受・初期停止",
  args: { catalog, standby: { status: "off", onToggle: fn() } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "声・動作で呼び出す（試験）" }),
    ).toHaveAttribute("aria-pressed", "false");
  },
};
export const LocalStandbyArmed: Story = {
  name: "声と動作の待受中",
  args: { catalog, standby: { status: "armed", onToggle: fn() } },
};
export const LocalStandbyPreparing: Story = {
  name: "声と動作の待受・モデル準備中",
  args: { catalog, standby: { status: "preparing", onToggle: fn() } },
};
export const LocalStandbyOffEnglish: Story = {
  ...LocalStandbyOff,
  name: "声と動作の待受・英語",
  tags: ["!test"],
  globals: { locale: "en" },
  play: undefined,
};

function RuntimeTrial() {
  const [voice] = useState(
    () =>
      new VoiceConnection(
        () => {},
        () => {},
      ),
  );
  useEffect(
    () => () => {
      void voice.stop();
    },
    [voice],
  );
  return (
    <KioskVoicePanel
      voice={voice}
      catalog={catalog}
      lines={[]}
      onStart={fn()}
      onWakeLanguage={fn(async () => {})}
    />
  );
}
export const LocalStandbyRuntime: Story = {
  name: "明示ONで端末内の実モデルを読み込む（外部音声接続は未設定）",
  tags: ["!test"],
  render: () => <RuntimeTrial />,
};
