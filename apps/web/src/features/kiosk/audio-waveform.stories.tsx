import type { Meta, StoryObj } from "@storybook/react-vite";
import { AudioWaveform, type VoiceVisualState } from "./audio-waveform";

const meta = {
  title: "客向け/音声の状態",
  component: AudioWaveform,
  args: { state: "listening", label: "聞き取り中" },
} satisfies Meta<typeof AudioWaveform>;
export default meta;
type Story = StoryObj<typeof meta>;

export const States: Story = {
  name: "無音でも動きと記号で状態を区別",
  render: () => (
    <div className="grid max-w-3xl grid-cols-1 gap-4 p-4 sm:grid-cols-2">
      {(
        [
          ["paused", "音声は停止中です"],
          ["connecting", "接続中"],
          ["listening", "聞き取り中"],
          ["thinking", "考え中"],
          ["tool", "ツール実行中"],
          ["speaking", "話しています"],
          ["stopping", "停止しています"],
          ["error", "接続エラー"],
        ] satisfies [VoiceVisualState, string][]
      ).map(([state, label]) => (
        <div className="rounded-xl border border-border bg-white p-3" key={state}>
          <AudioWaveform state={state} label={label} />
        </div>
      ))}
    </div>
  ),
};
