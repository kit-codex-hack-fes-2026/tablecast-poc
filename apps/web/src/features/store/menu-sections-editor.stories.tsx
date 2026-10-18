import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import { MenuSectionsEditor } from "./menu-sections-editor";
const meta = {
  title: "店舗/メニューの組版",
  component: MenuSectionsEditor,
  parameters: { layout: "padded" },
  args: { storeId: catalog.storeId, value: catalog.configuration, disabled: false, onChange: fn() },
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return (
      <MenuSectionsEditor
        {...args}
        value={value}
        onChange={(change) =>
          setValue({ ...value, appearance: { ...value.appearance, ...change, version: 2 } })
        }
      />
    );
  },
} satisfies Meta<typeof MenuSectionsEditor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Composition: Story = {
  name: "標準メニューからセクションを組み替える",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /^写真と文章$/ }));
    const heading = canvas.getByRole("textbox", { name: "見出し · 日本語" });
    await userEvent.type(heading, "季節を味わう");
    await userEvent.type(
      canvas.getByRole("textbox", { name: "見出し · 英語" }),
      "A taste of the season",
    );
    const list = canvas.getByRole("list", { name: "セクションの順番" });
    const before = within(list).getAllByRole("listitem").length;
    await userEvent.click(within(list).getAllByRole("button", { name: "上へ移動" })[before - 1]);
    await expect(within(list).getAllByRole("listitem")[before - 2]).toHaveTextContent(
      "季節を味わう",
    );
    await userEvent.click(within(list).getAllByRole("button", { name: "複製" })[before - 2]);
    await expect(within(list).getAllByRole("listitem")).toHaveLength(before + 1);
    await userEvent.click(within(list).getAllByRole("button", { name: "削除" })[before - 1]);
    await userEvent.click(canvas.getByRole("button", { name: "削除したセクションを戻す" }));
    await expect(within(list).getAllByRole("listitem")).toHaveLength(before + 1);
    await userEvent.selectOptions(canvas.getByRole("combobox", { name: "プレビュー言語" }), "en");
    await expect(canvas.getAllByText("A taste of the season").length).toBeGreaterThan(0);
    await expect(document.documentElement.lang).toBe("ja");
  },
};
export const English: Story = { name: "英語の編集", globals: { locale: "en" } };
