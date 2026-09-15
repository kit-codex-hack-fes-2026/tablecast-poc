import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { productSchema, type Product } from "@tablecast/api/schema";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "../../i18n/locale";
import { OptionConditionsEditor } from "./option-conditions-editor";

const text = (ja: string, en: string) => ({
  ja: { displayName: ja, speechName: ja, description: "", aliases: [] },
  en: { displayName: en, speechName: en, description: "", aliases: [] },
});
const product = productSchema.parse({
  id: "tablecast-condition-coffee",
  categoryId: "drinks",
  text: text("コーヒーのカスタマイズ", "Coffee customisation"),
  price: 500,
  available: true,
  allergens: {
    contains: [],
    evidence: "unknown",
    crossContact: "unknown",
    vegan: "unknown",
    note: { ja: "", en: "" },
  },
  modifiers: [
    {
      id: "toppings",
      text: text("トッピング", "Toppings"),
      kind: "multiple",
      min: 0,
      max: 4,
      options: [
        {
          id: "X",
          text: text("ホイップ", "Whipped cream"),
          priceDelta: 50,
          available: true,
          conditions: {
            version: 2,
            requires: {
              kind: "and",
              children: [
                { kind: "option", optionId: "A" },
                {
                  kind: "or",
                  children: [
                    { kind: "option", optionId: "B" },
                    { kind: "not", child: { kind: "option", optionId: "C" } },
                  ],
                },
              ],
            },
            excludes: null,
          },
        },
        { id: "A", text: text("チョコレート", "Chocolate"), priceDelta: 30, available: true },
        { id: "B", text: text("ナッツ", "Nuts"), priceDelta: 30, available: true },
        { id: "C", text: text("シナモン", "Cinnamon"), priceDelta: 0, available: true },
      ],
    },
  ],
});
function Editor({ initial = product }: { initial?: Product }) {
  const { locale, t } = useI18n();
  const [value, setValue] = useState(initial);
  const [client] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <main className="mx-auto max-w-4xl p-6">
        <h1 className="mb-5 text-xl font-semibold">{value.text[locale].displayName} · X</h1>
        <h2 className="mb-3 font-semibold">{t("editor_modifiers")}</h2>
        <h3 className="mb-3 font-semibold">{value.modifiers[0]?.text[locale].displayName}</h3>
        <h4 className="mb-3 font-semibold">
          {value.modifiers[0]?.options[0]?.text[locale].displayName}
        </h4>
        <OptionConditionsEditor
          storeId="tablecast-story"
          product={value}
          optionId="X"
          disabled={false}
          onChange={(change) =>
            setValue({
              ...value,
              modifiers: value.modifiers.map((group) => ({
                ...group,
                options: group.options.map((option) =>
                  option.id === "X" ? { ...option, ...change } : option,
                ),
              })),
            })
          }
        />
      </main>
    </QueryClientProvider>
  );
}
const meta = { title: "店舗/選択肢の条件", component: Editor } satisfies Meta<typeof Editor>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Nested: Story = { name: "AND・OR・NOTと選択肢の補完" };
export const English: Story = { name: "英語の条件編集", globals: { locale: "en" } };
