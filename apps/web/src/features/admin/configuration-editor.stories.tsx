import type { Meta, StoryObj } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, useEffect, useState } from "react";
import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test";
import { Button } from "../../components/ui/button";
import { CastEditor } from "./configuration-editor";

const requests = fn<(url: URL, options?: RequestInit) => Response | Promise<Response>>();
let finishOldRequest = () => {};
let oldSignal: AbortSignal | null | undefined;

function mockVoices() {
  const unexpected: string[] = [];
  const mocked = spyOn(globalThis, "fetch").mockImplementation((input, options) => {
    const url = new URL(input instanceof Request ? input.url : input, window.location.origin);
    if (/^\/api\/admin\/stores\/tablecast-story-[ab]\/voices$/.test(url.pathname)) {
      return Promise.resolve(requests(url, options));
    }
    unexpected.push(url.pathname);
    return Promise.resolve(
      Response.json({ error: { code: "UNEXPECTED_TEST_REQUEST" } }, { status: 500 }),
    );
  });
  return () => {
    finishOldRequest();
    mocked.mockRestore();
    if (unexpected.length) throw new Error(`未定義の要求: ${unexpected.join(", ")}`);
  };
}

const meta = {
  title: "店舗/キャスト音声の編集",
  component: CastEditor,
  args: {
    storeId: "tablecast-story-a",
    value: {
      instructions: { ja: "", en: "" },
      voice: { ja: null, en: "Ashley" },
      proactive: false,
    },
    voices: [{ ja: null, en: "Olivia" }],
    disabled: false,
    onChange: fn(),
  },
  beforeEach: () => {
    requests.mockReset();
    finishOldRequest = () => {};
    oldSignal = undefined;
    return mockVoices();
  },
  decorators: [
    function WithQueries(Story) {
      const [client] = useState(() => new QueryClient());
      useEffect(() => () => client.clear(), [client]);
      return (
        <QueryClientProvider client={client}>
          <Story />
        </QueryClientProvider>
      );
    },
  ],
  render: function Render(args) {
    const [saved, setSaved] = useState(args.value);
    const [value, setValue] = useState(args.value);
    const [published, setPublished] = useState(args.voices);
    const [storeId, setStoreId] = useState(args.storeId);
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
          storeId={storeId}
          value={value}
          voices={[...published, saved.voice]}
          onChange={setValue}
        />
        <Button type="submit">保存</Button>
        <output aria-label="保存された音声">{saved.voice.en ?? "未設定"}</output>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const next = { ...args.value, voice: { ja: null, en: null } };
            setPublished([{ ja: null, en: "Dennis" }]);
            setSaved(next);
            setValue(next);
            setStoreId("tablecast-story-b");
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
  beforeEach: () => {
    requests.mockImplementation(() =>
      Response.json({ error: { code: "VOICE_CATALOG_NOT_CONFIGURED" } }, { status: 503 }),
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = within(canvas.getByRole("group", { name: "英語" }));
    const voice = group.getByRole("combobox", { name: "音声設定" });
    await expect(await group.findByText("音声一覧は未設定です。")).toBeInTheDocument();
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

export const PagedVoices: Story = {
  name: "標準音声の次ページ失敗から再試行し、表示名で選んだIDと入力を保存する",
  globals: { locale: "en" },
  beforeEach: () => {
    let nextAttempts = 0;
    requests.mockImplementation((url) => {
      if (url.searchParams.get("locale") === "ja") {
        return Response.json({ voices: [], nextPageToken: null });
      }
      if (url.searchParams.has("pageToken")) {
        nextAttempts += 1;
        if (nextAttempts === 1) {
          return Response.json({ error: { code: "VOICE_CATALOG_UNAVAILABLE" } }, { status: 503 });
        }
        return Response.json({
          voices: [
            { voiceId: "Ashley", displayName: "Ashley — English", langCode: "EN_US" },
            { voiceId: "Dennis", displayName: "Dennis — English", langCode: "EN_US" },
          ],
          nextPageToken: null,
        });
      }
      return Response.json({
        voices: [{ voiceId: "Ashley", displayName: "Ashley — English", langCode: "EN_US" }],
        nextPageToken: "tablecast-next",
      });
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const english = within(canvas.getByRole("group", { name: "English" }));
    const japanese = within(canvas.getByRole("group", { name: "Japanese" }));
    const voice = english.getByRole("combobox", { name: "Voice setting" });
    const instructions = english.getByRole("textbox");
    await expect(
      await japanese.findByText("No standard voices are available."),
    ).toBeInTheDocument();
    await expect(
      await english.findByRole("option", { name: "Ashley — English" }),
    ).toBeInTheDocument();
    await userEvent.type(instructions, "Speak calmly.");

    // 次ページだけ失敗しても、既取得の候補と編集中の指示は保つ。
    await userEvent.click(english.getByRole("button", { name: "Show more voices" }));
    await expect(await english.findByRole("alert")).toHaveTextContent(
      "The voice list could not be loaded.",
    );
    await expect(voice).toHaveValue("Ashley");
    await userEvent.click(english.getByRole("button", { name: "Try again" }));
    await expect(
      await english.findByRole("option", { name: "Dennis — English" }),
    ).toBeInTheDocument();
    await expect(english.getAllByRole("option", { name: "Ashley — English" })).toHaveLength(1);
    await expect(instructions).toHaveValue("Speak calmly.");
    await expect(
      english.queryByRole("button", { name: "Show more voices" }),
    ).not.toBeInTheDocument();
    await userEvent.selectOptions(voice, "Dennis");
    await userEvent.click(canvas.getByRole("button", { name: "保存" }));
    await expect(canvas.getByRole("status", { name: "保存された音声" })).toHaveTextContent(
      "Dennis",
    );
    await expect(voice).toHaveValue("Dennis");
    await expect(
      requests.mock.calls.filter(([url]) => url.searchParams.get("pageToken") === "tablecast-next"),
    ).toHaveLength(2);
    await expect(
      requests.mock.calls.every(
        ([url]) => url.searchParams.get("locale") !== "ja" || !url.searchParams.has("pageToken"),
      ),
    ).toBe(true);
  },
};

export const CancelPreviousStore: Story = {
  name: "店舗を切り替えると一覧取得を中断し、旧店舗の遅延結果を表示しない",
  beforeEach: () => {
    requests.mockImplementation((url, options) => {
      if (url.searchParams.get("locale") === "ja") {
        return Response.json({ voices: [], nextPageToken: null });
      }
      if (url.pathname.includes("tablecast-story-a")) {
        oldSignal = options?.signal;
        return new Promise<Response>((resolve) => {
          finishOldRequest = () =>
            resolve(
              Response.json({
                voices: [
                  { voiceId: "Ashley", displayName: "Ashley — previous store", langCode: "EN_US" },
                ],
                nextPageToken: null,
              }),
            );
        });
      }
      return Response.json({
        voices: [{ voiceId: "Dennis", displayName: "Dennis — current store", langCode: "EN_US" }],
        nextPageToken: null,
      });
    });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const english = within(canvas.getByRole("group", { name: "英語" }));
    await waitFor(() => expect(oldSignal).toBeDefined());
    await userEvent.click(canvas.getByRole("button", { name: "別店舗へ切替" }));
    await expect(
      await english.findByRole("option", { name: "Dennis — current store" }),
    ).toBeInTheDocument();
    await expect(oldSignal?.aborted).toBe(true);
    await act(async () => {
      finishOldRequest();
    });
    await waitFor(async () => {
      await expect(english.queryByRole("option", { name: /Ashley/ })).not.toBeInTheDocument();
      await expect(english.queryByRole("option", { name: "Olivia" })).not.toBeInTheDocument();
      await expect(english.getByRole("combobox", { name: "音声設定" })).toHaveValue("");
    });
    await expect(
      requests.mock.calls
        .filter(([url]) => url.pathname.includes("tablecast-story-b"))
        .every(([url]) => !url.searchParams.has("pageToken")),
    ).toBe(true);
  },
};
