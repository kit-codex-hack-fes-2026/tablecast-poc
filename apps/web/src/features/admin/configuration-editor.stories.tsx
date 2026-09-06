import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { Button } from "../../components/ui/button";
import { CastEditor } from "./configuration-editor";

const meta = {
  title: "店舗/キャスト音声の編集",
  component: CastEditor,
  args: {
    value: {
      instructions: { ja: "", en: "" },
      voice: { ja: null, en: "Ashley" },
      proactive: false,
    },
    voices: [{ ja: null, en: "Olivia" }],
    disabled: false,
    onChange: fn(),
  },
  render: function Render(args) {
    const [saved, setSaved] = useState(args.value);
    const [value, setValue] = useState(args.value);
    const [published, setPublished] = useState(args.voices);
    return (
      <form
        className="mx-auto max-w-xl space-y-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(value);
        }}
      >
        <CastEditor
          {...args}
          value={value}
          voices={[...published, saved.voice]}
          onChange={setValue}
        />
        <Button type="submit">保存</Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const next = { ...args.value, voice: { ja: null, en: null } };
            setPublished([{ ja: null, en: "Dennis" }]);
            setSaved(next);
            setValue(next);
          }}
        >
          別店舗へ切替
        </Button>
      </form>
    );
  },
} satisfies Meta<typeof CastEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RestorePublishedVoice: Story = {
  name: "未設定を保存した後も公開音声を再選択でき、別店舗の候補を残さない",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = within(canvas.getByRole("group", { name: "英語" }));
    const voice = group.getByRole("combobox", { name: "音声設定" });
    await expect(voice).toHaveValue("Ashley");
    await expect(group.getByRole("option", { name: "Olivia" })).toBeInTheDocument();

    // 保存済み下書きがnullへ更新されても、公開設定のIDは候補に残す。
    await userEvent.selectOptions(voice, "");
    await userEvent.click(canvas.getByRole("button", { name: "保存" }));
    await expect(voice).toHaveValue("");
    await expect(group.queryByRole("option", { name: "Ashley" })).not.toBeInTheDocument();
    await userEvent.selectOptions(voice, "Olivia");
    await userEvent.click(canvas.getByRole("button", { name: "保存" }));
    await expect(voice).toHaveValue("Olivia");
    await expect(group.getAllByRole("option", { name: "Olivia" })).toHaveLength(1);

    await userEvent.click(canvas.getByRole("button", { name: "別店舗へ切替" }));
    await expect(voice).toHaveValue("");
    await expect(group.queryByRole("option", { name: "Olivia" })).not.toBeInTheDocument();
    await expect(group.getByRole("option", { name: "Dennis" })).toBeInTheDocument();
  },
};
