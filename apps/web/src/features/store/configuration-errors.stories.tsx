import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ConfigurationIssue } from "@tablecast/api/schema";
import { expect, within } from "storybook/test";
import { catalog } from "../../../.storybook/tablecast-fixtures";
import { ConfigurationErrors } from "./configuration-errors";

const errors: ConfigurationIssue[] = [
  { code: "DUPLICATE_ID", path: ["products", 0, "id"], params: { id: "tablecast-sake" } },
  {
    code: "CATEGORY_NOT_FOUND",
    path: ["products", 0, "categoryId"],
    params: { categoryId: "tablecast-missing-category" },
  },
  {
    code: "MODIFIER_SELECTION_RANGE",
    path: ["products", 0, "modifiers", 0],
    params: { min: 2, max: 1, kind: "single" },
  },
  {
    code: "MODIFIER_CAPACITY",
    path: ["products", 0, "modifiers", 0, "max"],
    params: { max: 3, capacity: 2 },
  },
  {
    code: "OPTION_REFERENCE_INVALID",
    path: ["products", 0, "modifiers", 0, "options", 0, "requires", 0],
    params: {
      optionId: "tablecast-glass",
      referenceId: "tablecast-missing-option",
      relation: "requires",
    },
  },
  {
    code: "PLAN_LAST_ORDER_INVALID",
    path: ["plans", 0, "lastOrderMinutesBeforeEnd"],
    params: { durationMinutes: 60, lastOrderMinutesBeforeEnd: 60 },
  },
  { code: "PLAN_TARGET_EMPTY", path: ["plans", 0], params: {} },
  {
    code: "PRODUCT_NOT_FOUND",
    path: ["plans", 0, "productIds", 0],
    params: { productId: "tablecast-missing-product" },
  },
  {
    code: "OPTION_NOT_FOUND",
    path: ["plans", 0, "excludedOptionIds", 0],
    params: { optionId: "tablecast-excluded-option" },
  },
  {
    code: "VOICE_NOT_FOUND",
    path: ["cast", "voice", "ja"],
    params: { voiceId: "tablecast-missing-voice" },
  },
  {
    code: "VOICE_NOT_STANDARD",
    path: ["cast", "voice", "en"],
    params: { voiceId: "tablecast-custom-voice" },
  },
  {
    code: "VOICE_LANGUAGE_MISMATCH",
    path: ["cast", "voice", "ja"],
    params: { voiceId: "tablecast-english-voice", locale: "ja", langCode: "en-US" },
  },
];

const meta = {
  title: "店舗/設定の検証エラー",
  component: ConfigurationErrors,
  args: {
    errors,
    configuration: {
      ...catalog.configuration,
      plans: [
        {
          id: "tablecast-plan",
          text: {
            ja: {
              displayName: "日本酒プラン",
              speechName: "にほんしゅぷらん",
              description: "",
              aliases: [],
            },
            en: { displayName: "Sake plan", speechName: "Sake plan", description: "", aliases: [] },
          },
          pricePerPerson: 2000,
          durationMinutes: 60,
          lastOrderMinutesBeforeEnd: 60,
          productIds: [],
          categoryIds: [],
          tags: [],
          maxPerOrder: 5,
          maxTotalPerPerson: 20,
          intervalSeconds: 0,
          excludedOptionIds: [],
          includedOptionSurcharge: false,
        },
      ],
    },
  },
} satisfies Meta<typeof ConfigurationErrors>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Japanese: Story = {
  name: "対象名と全ての業務検証理由を日本語で表示",
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("list", { name: "設定の検証エラー" });
    const rows = within(list).getAllByRole("listitem");
    await expect(rows).toHaveLength(12);
    await expect(rows[0]).toHaveTextContent("こもれび 月凪 純米吟醸: IDが重複しています。");
    await expect(rows[1]).toHaveTextContent("カテゴリが見つかりません。");
    await expect(rows[2]).toHaveTextContent("容量: 最小・最大選択数と選択方法が一致していません。");
    await expect(rows[3]).toHaveTextContent("最大選択数が、選択肢で指定できる数量を超えています。");
    await expect(rows[4]).toHaveTextContent(
      "容量 / 60 mL: 必要な選択肢または併用できない選択肢の参照が不正です。",
    );
    await expect(rows[5]).toHaveTextContent(
      "日本酒プラン: ラストオーダーはプラン開始後になるよう設定してください。",
    );
    await expect(rows[6]).toHaveTextContent("対象の商品・カテゴリ・タグを指定してください。");
    await expect(rows[7]).toHaveTextContent("商品が見つかりません。 (tablecast-missing-product)");
    await expect(rows[8]).toHaveTextContent(
      "対象外の選択肢が見つかりません。 (tablecast-excluded-option)",
    );
    await expect(rows[9]).toHaveTextContent(
      "音声設定 / 日本語: 標準音声が見つかりません。 (tablecast-missing-voice)",
    );
    await expect(rows[10]).toHaveTextContent(
      "音声設定 / 英語: この音声は標準音声ではありません。 (tablecast-custom-voice)",
    );
    await expect(rows[11]).toHaveTextContent(
      "音声設定 / 日本語: この音声は対象の言語に対応していません。 (tablecast-english-voice)",
    );
  },
};
export const English: Story = {
  name: "対象名と全ての業務検証理由を英語で表示",
  globals: { locale: "en" },
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("list", { name: "Settings validation errors" });
    const rows = within(list).getAllByRole("listitem");
    await expect(rows).toHaveLength(12);
    await expect(list).not.toHaveTextContent(/[\u3040-\u30ff\u4e00-\u9fff]/);
    await expect(rows[0]).toHaveTextContent(
      "Komorebi Tsukinagi, a fragrant and gently dry junmai ginjo sake: This ID is used more than once.",
    );
    await expect(rows[1]).toHaveTextContent(
      "The category could not be found. (tablecast-missing-category)",
    );
    await expect(rows[2]).toHaveTextContent(
      "Serving size: The minimum and maximum selections do not match the selection type.",
    );
    await expect(rows[3]).toHaveTextContent(
      "The maximum selections exceed the quantity allowed by the options.",
    );
    await expect(rows[4]).toHaveTextContent(
      "Serving size / 60 mL: A required or incompatible option reference is invalid. (tablecast-missing-option)",
    );
    await expect(rows[5]).toHaveTextContent(
      "Sake plan: Last orders must be after the plan starts.",
    );
    await expect(rows[6]).toHaveTextContent(
      "Select at least one product, category or tag for this plan.",
    );
    await expect(rows[7]).toHaveTextContent(
      "The product could not be found. (tablecast-missing-product)",
    );
    await expect(rows[8]).toHaveTextContent(
      "The excluded option could not be found. (tablecast-excluded-option)",
    );
    await expect(rows[9]).toHaveTextContent(
      "Voice setting / Japanese: The standard voice could not be found. (tablecast-missing-voice)",
    );
    await expect(rows[10]).toHaveTextContent(
      "Voice setting / English: This voice is not a standard voice. (tablecast-custom-voice)",
    );
    await expect(rows[11]).toHaveTextContent(
      "Voice setting / Japanese: This voice does not support the selected language. (tablecast-english-voice)",
    );
  },
};
