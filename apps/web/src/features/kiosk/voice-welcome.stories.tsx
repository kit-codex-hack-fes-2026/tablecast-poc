import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { expect, fn, userEvent, within } from "storybook/test";
import { VoicePanel } from "./voice-panel";

const meta = {
  title: "客向け/会話",
  component: VoicePanel,
  args: {
    view: { status: "idle" },
    lines: [],
    onStart: fn(),
    onMicrophoneChange: fn(),
    onMicrophoneRefresh: fn(),
    onSpeedChange: fn(),
  },
} satisfies Meta<typeof VoicePanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Welcome: Story = {
  name: "日本語の初回表示",
  render: (args) => (
    <div className="h-160 max-w-2xl">
      <VoicePanel {...args} />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("声で相談・注文")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "会話を始める" }));
    await expect(args.onStart).toHaveBeenCalledOnce();
    const resume = canvas.getByRole("button", { name: "音声を再開" });
    await expect(resume.closest("footer")).not.toBeNull();
    await userEvent.click(resume);
    await expect(args.onStart).toHaveBeenCalledTimes(2);
    await expect(canvas.queryByRole("textbox")).not.toBeInTheDocument();
  },
};
export const English: Story = {
  name: "英語の初回表示",
  tags: ["!test"],
  globals: { locale: "en" },
  render: Welcome.render,
};

export const Calling: Story = {
  name: "呼び出し待受中の初期案内",
  args: { standby: { status: "armed", onStop: fn() } },
  render: Welcome.render,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/すみませんと声をかけるか/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "音声を停止" }));
    await expect(args.standby?.onStop).toHaveBeenCalledOnce();
    await expect(args.onStart).not.toHaveBeenCalled();
  },
};

export const Compact: Story = {
  name: "iPadの既定240px幅の初期案内",
  render: (args) => (
    <div className="h-173 w-60">
      <VoicePanel {...args} />
    </div>
  ),
};
export const CompactEnglish: Story = {
  ...Compact,
  name: "iPadの既定240px幅の初期案内・英語",
  globals: { locale: "en" },
};
export const Mobile: Story = {
  name: "縦画面の短い会話欄で初期案内",
  render: (args) => (
    <div className="h-90">
      <VoicePanel {...args} />
    </div>
  ),
};
export const MobileEnglish: Story = {
  ...Mobile,
  name: "縦画面の短い会話欄で初期案内・英語",
  globals: { locale: "en" },
};
