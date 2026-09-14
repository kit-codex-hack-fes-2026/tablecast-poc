import type { Meta, StoryObj } from "@storybook/tanstack-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test";
import { Pencil } from "lucide-react";
import { Button } from "../../components/ui/button";
import { useI18n } from "../../i18n/locale";
import { m } from "../../paraglide/messages";
import { CastOverview } from "./cast-overview";
import type { CastTarget } from "./menu-model";

const edit = fn<(target: CastTarget) => void>();
const catalog = fn<() => Response>();
const japanese =
  "お客さまの質問に簡潔で丁寧にお答えください。料理の好みやアレルギーを確認し、迷っているときはスタッフへ相談してください。\n";
const english =
  "Welcome guests warmly and explain the menu clearly. Ask about preferences and allergies, and consult a member of staff when needed.\n";

const meta = {
  title: "店舗/接客設定の概要",
  component: CastOverview,
  args: {
    storeId: "tablecast-story-cast",
    value: {
      instructions: { ja: japanese.repeat(30), en: english.repeat(30) },
      voice: { ja: "marin", en: "cedar" },
      proactive: true,
    },
  },
  beforeEach: () => {
    edit.mockReset();
    catalog.mockReset();
    catalog.mockImplementation(() =>
      Response.json({
        voices: [
          { voiceId: "marin", displayName: "Marin", langCode: "ja" },
          { voiceId: "cedar", displayName: "Cedar", langCode: "en" },
        ],
        nextPageToken: null,
      }),
    );
    const fetch = spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = new URL(input instanceof Request ? input.url : input, window.location.origin);
      if (url.pathname === "/api/admin/stores/tablecast-story-cast/voices")
        return Promise.resolve(catalog());
      return Promise.reject(new Error(`未定義の要求: ${url.pathname}`));
    });
    return () => fetch.mockRestore();
  },
  decorators: [
    function Queries(Story) {
      const [client] = useState(() => new QueryClient());
      useEffect(() => () => client.clear(), [client]);
      return (
        <QueryClientProvider client={client}>
          <main className="p-6">
            <Story />
          </main>
        </QueryClientProvider>
      );
    },
  ],
  render: function Overview(args) {
    const { locale, t } = useI18n();
    return (
      <CastOverview
        {...args}
        renderEdit={
          args.renderEdit ??
          ((target) => {
            const language = t(target.endsWith("ja") ? "common_ja" : "common_en");
            const label =
              target === "proactive"
                ? t("cast_edit_proactive")
                : target.startsWith("instructions")
                  ? m.cast_edit_instructions({ language }, { locale })
                  : m.cast_edit_voice({ language }, { locale });
            return (
              <Button type="button" variant="outline" onClick={() => edit(target)}>
                <Pencil />
                {label}
              </Button>
            );
          })
        }
      />
    );
  },
} satisfies Meta<typeof CastOverview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const JapaneseLongInstructions: Story = {
  globals: { locale: "ja" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Marin", { exact: true })).toBeVisible();
    await expect(canvas.getByText("Cedar", { exact: true })).toBeVisible();
    await expect(canvas.queryByRole("table")).not.toBeInTheDocument();
    const expand = canvas.getAllByRole("button", { name: "全文を表示" })[0];
    expand.focus();
    await userEvent.keyboard("{Enter}");
    const dialog = await within(canvasElement.ownerDocument.body).findByRole("dialog", {
      name: "接客方針",
    });
    const fullText = within(dialog).getByText(japanese.trim(), { exact: false });
    await expect(fullText.textContent).toBe(japanese.repeat(30));
    await userEvent.keyboard("{Escape}");
    await waitFor(async () => {
      await expect(dialog).not.toBeInTheDocument();
      await expect(expand).toHaveFocus();
    });
    await userEvent.click(canvas.getByRole("button", { name: "英語の音声を編集" }));
    await expect(edit).toHaveBeenCalledWith("voice-en");
    await expect(canvas.getByText("ON（有効）")).toBeVisible();
  },
};

export const EnglishReadOnlyAndUnavailable: Story = {
  globals: { locale: "en" },
  args: {
    value: {
      instructions: { ja: "", en: "" },
      voice: { ja: null, en: "previous-voice" },
      proactive: false,
    },
    renderEdit: () => null,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Unavailable", { exact: true })).toBeVisible();
    await expect(canvas.getByText("Not set", { exact: true })).toBeVisible();
    await expect(canvas.getByText("Marin (default)", { exact: true })).toBeVisible();
    await expect(canvas.getAllByText("No service instructions have been set.")).toHaveLength(2);
    await expect(canvas.getByText("OFF (disabled)", { exact: true })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
  },
};

export const VoiceCatalogRetry: Story = {
  globals: { locale: "ja" },
  beforeEach: () => {
    catalog.mockImplementation(() =>
      Response.json({ error: { code: "VOICE_CATALOG_UNAVAILABLE" } }, { status: 503 }),
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const retry = await canvas.findAllByRole("button", { name: "再試行" });
    await expect(canvas.queryByText("利用不可", { exact: true })).not.toBeInTheDocument();
    catalog.mockImplementation(() =>
      Response.json({
        voices: [{ voiceId: "marin", displayName: "Marin", langCode: "ja" }],
        nextPageToken: null,
      }),
    );
    await userEvent.click(retry[0]);
    await expect(await canvas.findByText("Marin", { exact: true })).toBeVisible();
  },
};
