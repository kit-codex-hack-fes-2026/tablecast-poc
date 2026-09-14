import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { configurationSchema } from "@tablecast/api/schema";
import { expect, userEvent, within } from "storybook/test";
import { useState } from "react";
import { Save } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { CategoriesEditor, PlansEditor, ProductsEditor } from "./configuration-editor";

const text = (ja: string, en: string) => ({
  ja: {
    displayName: ja,
    speechName: ja,
    description: "原材料や提供方法について、スタッフへご相談ください。".repeat(8),
    aliases: [],
  },
  en: {
    displayName: en,
    speechName: en,
    description: "Please ask a member of staff about ingredients and serving options. ".repeat(8),
    aliases: [],
  },
});
const configuration = configurationSchema.parse({
  categories: [{ id: "drinks", text: text("飲み物", "Drinks") }],
  products: [
    {
      id: "coffee",
      categoryId: "drinks",
      text: text("カフェラテ", "Caffè latte"),
      price: 500,
      available: true,
      allergens: {
        contains: ["乳"],
        evidence: "verified",
        crossContact: "possible",
        vegan: "no",
        note: { ja: "スタッフへご確認ください。", en: "Please ask a member of staff." },
      },
      modifiers: Array.from({ length: 3 }, (_, group) => ({
        id: `milk-${group}`,
        text: text("ミルク", "Milk"),
        kind: "single",
        min: 0,
        max: 1,
        options: Array.from({ length: 5 }, (_entry, option) => ({
          id: `milk-${group}-${option}`,
          text: text("ミルク", "Milk"),
          priceDelta: option * 50,
          available: true,
        })),
      })),
    },
  ],
  plans: [
    {
      id: "drinks-plan",
      text: text("飲み放題", "Unlimited drinks"),
      pricePerPerson: 2000,
      durationMinutes: 90,
      lastOrderMinutesBeforeEnd: 15,
      maxPerOrder: 2,
      maxTotalPerPerson: 10,
      intervalSeconds: 30,
      productIds: ["coffee"],
      categoryIds: [],
      tags: [],
      excludedOptionIds: [],
      includedOptionSurcharge: false,
    },
  ],
  cast: {
    instructions: { ja: "丁寧に接客する", en: "Speak politely." },
    voice: { ja: null, en: null },
    proactive: false,
  },
});

function ConfigurationLayout({
  section = "products",
}: {
  section?: "products" | "categories" | "plans";
}) {
  const { t, locale } = useI18n();
  const [value, setValue] = useState(configuration);
  const [saved, setSaved] = useState(false);
  const item = value[section][0];
  const props = { value, onChange: setValue, selectedId: item.id, disabled: false };
  return (
    <main className="mx-auto max-w-4xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">{item.text[locale].displayName}</h1>
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(true);
        }}
      >
        <fieldset className="min-w-0 space-y-5">
          {section === "products" && <ProductsEditor {...props} />}
          {section === "categories" && <CategoriesEditor {...props} />}
          {section === "plans" && <PlansEditor {...props} />}
        </fieldset>
        <div className="sticky bottom-0 flex flex-wrap gap-3 border-t bg-background py-4">
          <Button type="submit">
            <Save aria-hidden="true" />
            {t("common_save")}
          </Button>
          <output>{saved ? t("account_saved") : ""}</output>
        </div>
      </form>
    </main>
  );
}
const meta = { title: "店舗/設定フォームの配置", component: ConfigurationLayout } satisfies Meta<
  typeof ConfigurationLayout
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Product: Story = { name: "商品・同名のグループと選択肢" };
export const English: Story = { name: "英語・長文の反復行", globals: { locale: "en" } };
export const Category: Story = { name: "カテゴリ", args: { section: "categories" } };
export const Plan: Story = { name: "プラン", args: { section: "plans" } };

export const RepeatedRows: Story = {
  name: "追加・削除と詳細内のエラーで対象と入力を保持する",
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = within(canvas.getByRole("group", { name: "グループ 1：ミルク" }));
    const option = within(
      group.getByRole("group", { name: "グループ 1：ミルク 選択肢 1：ミルク" }),
    );
    const price = option.getByRole("spinbutton", {
      name: "グループ 1：ミルク 選択肢 1：ミルク 追加料金（税込・円）",
    });
    await userEvent.clear(price);
    await userEvent.type(price, "275");
    await expect(price).toHaveFocus();
    await userEvent.tab();
    await expect(option.getByRole("spinbutton", { name: /選択肢ごとの最大数量/ })).toHaveFocus();

    await userEvent.click(group.getByRole("button", { name: "選択肢を追加 グループ 1：ミルク" }));
    await expect(group.getByRole("heading", { name: "選択肢 6：未設定" })).toHaveFocus();
    await userEvent.click(
      group.getByRole("button", { name: "選択肢を削除 グループ 1：ミルク 選択肢 6：未設定" }),
    );
    await expect(group.getByRole("heading", { name: "選択肢 5：ミルク" })).toHaveFocus();
    await expect(price).toHaveValue(275);

    await userEvent.click(canvas.getByRole("button", { name: "グループを追加" }));
    await expect(canvas.getByRole("heading", { name: "グループ 4：未設定" })).toHaveFocus();
    await userEvent.click(
      canvas.getByRole("button", { name: "グループを削除 グループ 4：未設定" }),
    );
    await expect(canvas.getByRole("heading", { name: "グループ 3：ミルク" })).toHaveFocus();

    const details = option.getByText("名称・説明・画像・組合せ条件", { exact: true });
    await userEvent.click(details);
    const speechName = option.getByRole("textbox", {
      name: "グループ 1：ミルク 選択肢 1：ミルク 日本語 読上げ名",
    });
    await userEvent.clear(speechName);
    await userEvent.click(details);
    await expect(speechName).not.toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "保存する" }));
    await expect(speechName).toBeVisible();
    await expect(speechName).toHaveFocus();
    await expect(speechName).toBeInvalid();
    await expect(price).toHaveValue(275);
    await userEvent.type(speechName, "ミルク");
    await userEvent.click(canvas.getByRole("button", { name: "保存する" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("更新しました");
  },
};

export const EnglishLabels: Story = {
  name: "英語でも同名の対象と言語を区別する",
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const option = within(canvas.getByRole("group", { name: "Group 2: Milk Option 3: Milk" }));
    await userEvent.click(option.getByText("Names, descriptions, images and combination rules"));
    const field = option.getByRole("textbox", {
      name: "Group 2: Milk Option 3: Milk English Spoken name",
    });
    await userEvent.clear(field);
    await userEvent.type(field, "Oat milk");
    await expect(field).toHaveFocus();
    await expect(field).toHaveValue("Oat milk");
    await expect(
      option.getByRole("textbox", { name: "Group 2: Milk Option 3: Milk Japanese Spoken name" }),
    ).toHaveValue("ミルク");
  },
};
