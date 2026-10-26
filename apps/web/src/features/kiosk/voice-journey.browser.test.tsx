import { type TableEvent } from "@tablecast/api/schema";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import { page, server } from "vitest/browser";
import { z } from "zod";
import en from "../../../messages/en.json";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider, useI18n } from "../../i18n/locale";
import { apiFetch } from "../../lib/api-fetch";
import "../../styles.css";
import { KioskVoicePanel } from "./kiosk-voice-panel";
import { event } from "./test-support/voice-panel-fixture";
import { peer, voiceFixture, VoicePeer } from "./test-support/voice-transport-fixture";
import { VoiceConnection } from "./voice-connection";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
afterEach(async () => {
  await cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const receive = (payload: unknown) =>
  peer().channel.receive({
    type: "response.event",
    delegation_id: "tablecast-journey",
    event: payload,
  });
const caption = (role: "assistant" | "user", delta: string, start_ms: number) =>
  peer().channel.receive({
    type:
      role === "assistant" ? "session.output_transcript.delta" : "session.input_transcript.delta",
    event_id: crypto.randomUUID(),
    delta,
    start_ms,
    end_ms: start_ms + 400,
  });

function Panel({ voice, events }: { events: TableEvent[]; voice: VoiceConnection }) {
  const { locale, setLocale } = useI18n();
  return (
    <div className="h-200 max-w-2xl">
      <button
        onClick={() => {
          setLocale("en");
          voice.synchronise("live_tablecast_1", true, 1, "en");
        }}
      >
        English
      </button>
      <KioskVoicePanel
        voice={voice}
        lines={[]}
        events={events}
        onStart={() => {
          void (voice.getSnapshot().status === "idle" ? voice.start(locale) : voice.stop());
        }}
      />
    </div>
  );
}

it("開始案内・候補選択・参考情報・言語切替・終了を同じ接続の画面で行う", async () => {
  await page.viewport(1180, 820);
  const originalNavigator = navigator;
  const OriginalStream = MediaStream;
  const fixture = voiceFixture();
  vi.stubGlobal("navigator", originalNavigator);
  vi.stubGlobal("MediaStream", OriginalStream);
  const audio = new AudioContext();
  const source = audio.createMediaStreamDestination().stream;
  vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(source);
  const original = vi.mocked(apiFetch).getMockImplementation();
  vi.mocked(apiFetch).mockImplementation(async (input, options) => {
    const path = input instanceof Request ? input.url : String(input);
    if (path.endsWith("/suggestions"))
      return Response.json({
        ...z
          .object({ locale: z.string(), itemId: z.string(), text: z.string() })
          .parse(JSON.parse(z.string().parse(options?.body))),
        suggestions: ["お茶の種類を教えてください", "おすすめの料理は？", "今は大丈夫です"],
      });
    const response = await original?.(input, options);
    if (!response) throw new Error("音声HTTP fixtureが必要です");
    if (path.endsWith("/start"))
      return Response.json({
        voiceSessionId: "live_tablecast_1",
        sdp: "tablecast-answer",
        proactive: false,
        guidance: true,
        opening: "いらっしゃいませ。",
      });
    if (path.endsWith("/tools"))
      return Response.json({ result: { ending: true }, conversationAction: "end" });
    return response;
  });
  const voice = new VoiceConnection(
    () => {},
    () => {},
  );
  fixture.connections.push(voice);
  const surface = (events: TableEvent[] = []) => (
    <LocaleProvider initialLocale="ja" persist={false}>
      <MotionProvider>
        <Panel voice={voice} events={events} />
      </MotionProvider>
    </LocaleProvider>
  );
  const screen = await render(surface());
  try {
    await screen.getByRole("button", { name: ja.kiosk_voice_resume, exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: ja.kiosk_voice_stop, exact: true }))
      .toBeVisible();
    caption("assistant", "お茶をご案内しましょうか？", 0);
    await screen.getByRole("button", { name: "お茶の種類を教えてください", exact: true }).click();
    await expect
      .poll(() => fixture.requests.filter(({ path }) => path.endsWith("/delegations")).length)
      .toBe(1);
    expect(voice.getSnapshot().suggestions).toEqual([]);
    await expect
      .poll(() =>
        peer().channel.send.mock.calls.some(
          ([data]) =>
            z.object({ type: z.string() }).parse(JSON.parse(data)).type === "response.create",
        ),
      )
      .toBe(true);
    const command = peer()
      .channel.send.mock.calls.map(([data]) =>
        z.object({ type: z.string(), event_id: z.string().optional() }).parse(JSON.parse(data)),
      )
      .findLast((value) => value.type === "response.create");
    peer().channel.receive({
      type: "response.event",
      delegation_id: null,
      client_event_id: command?.event_id,
      event: { type: "response.created", response: { id: "tablecast-journey-search" } },
    });
    receive({
      type: "response.web_search_call.searching",
      response_id: "tablecast-journey-search",
    });
    receive({
      type: "response.reasoning_summary_text.delta",
      response_id: "tablecast-journey-search",
      delta: "参考になる資料を確認しています。",
    });
    await expect.element(screen.getByText(ja.kiosk_searching, { exact: true })).toBeVisible();
    receive({ type: "response.completed", response: { id: "tablecast-journey-search" } });
    await screen.rerender(
      surface([
        {
          ...event(10, "voice.reference", {
            turnId: "tablecast-turn",
            reference: {
              url: "https://example.com/tea",
              title: "Tea guide",
              description: "お茶の参考情報です。",
            },
          }),
          createdAt: Date.now(),
        },
      ]),
    );
    await expect.element(screen.getByRole("link", { name: "Tea guide" })).toBeVisible();
    await page.screenshot({
      path: `../../../test-results/tablecast-voice-reference-${server.browser}.png`,
    });
    await screen.getByRole("button", { name: "English", exact: true }).click();
    expect(VoicePeer.instances).toHaveLength(1);
    expect(source.getAudioTracks()[0]?.readyState).toBe("live");
    expect(voice.getSnapshot().progress).toBeUndefined();
    caption("user", "No more help, thanks.", 1000);
    peer().channel.receive({
      type: "session.delegation.created",
      delegation: { id: "tablecast-journey", target: "responses" },
    });
    receive({ type: "response.created", response: { id: "tablecast-journey-end" } });
    receive({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        name: "endConversation",
        call_id: "tablecast-end",
        arguments: "{}",
      },
    });
    receive({ type: "response.completed", response: { id: "tablecast-journey-end" } });
    await expect
      .poll(() =>
        peer().channel.send.mock.calls.some(([data]) => data.includes("Certainly. Thank you.")),
      )
      .toBe(true);
    await screen.getByRole("button", { name: en.kiosk_voice_stop, exact: true }).click();
    await expect
      .element(screen.getByRole("button", { name: en.kiosk_voice_resume, exact: true }))
      .toBeVisible();
    expect(source.getAudioTracks()[0]?.readyState).toBe("ended");
    expect(fixture.requests.filter(({ path }) => path.endsWith("/start"))).toHaveLength(1);
  } finally {
    await screen.unmount();
    await fixture.dispose();
    await audio.close();
  }
});
