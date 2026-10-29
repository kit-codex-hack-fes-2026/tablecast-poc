import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { catalog } from "../../test-support/tablecast-fixtures";
import { GuidesEditor } from "./guides-editor";

const meta = {
  title: "店舗/店舗案内",
  component: GuidesEditor,
  args: {
    value: {
      ...catalog.configuration,
      guides: [
        {
          id: "tablecast-story-guide",
          text: {
            ja: {
              displayName: "お手洗い",
              speechName: "お手洗い",
              transliteration: "お手洗い",
              description: "店内奥の右手にございます。",
              aliases: ["トイレ"],
            },
            en: {
              displayName: "Toilets",
              speechName: "Toilets",
              transliteration: "Toilets",
              description: "At the back, on your right.",
              aliases: ["restroom"],
            },
          },
          productIds: [],
          links: [],
        },
      ],
    },
    selectedId: "tablecast-story-guide",
    disabled: false,
    onChange: fn(),
  },
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <GuidesEditor {...args} value={value} onChange={setValue} />;
  },
} satisfies Meta<typeof GuidesEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Japanese: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByRole("combobox", { name: "よくある用件のひな形" }),
      "Water",
    );
    const name = canvas.getAllByDisplayValue("お冷")[0];
    if (!name) throw new Error("ひな形の名称が必要です");
    await expect(name).toBeVisible();
    const product = canvas.getAllByRole("checkbox")[0];
    if (!product) throw new Error("試験用の関連商品が必要です");
    await userEvent.click(product);
    await expect(product).toBeChecked();
  },
};
