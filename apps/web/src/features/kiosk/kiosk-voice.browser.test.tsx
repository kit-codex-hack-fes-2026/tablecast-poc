import { type TableState } from "@tablecast/api/schema";
import { QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";
import ja from "../../../messages/ja.json";
import { MotionProvider } from "../../components/motion-provider";
import { LocaleProvider } from "../../i18n/locale";
import "../../styles.css";
import { Kiosk } from "./kiosk";
import { fixture, requests } from "./test-support/kiosk-fixture";
import { VoicePanel } from "./voice-panel";

vi.mock("@ricky0123/vad-web", () => ({
  MicVAD: { new: async () => ({ start: async () => {}, destroy: async () => {} }) },
}));

it.each(["listening", "speaking"] as const)(
  "%sでは小さなorbと実波形を表示し、停止しても下部操作の位置を保つ",
  async (status) => {
    await page.viewport(390, 844);
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const destination = audio.createMediaStreamDestination();
    const analyser = audio.createAnalyser();
    analyser.fftSize = 256;
    const samples = new Uint8Array(analyser.fftSize);
    oscillator.connect(destination);
    oscillator.connect(analyser);
    oscillator.start();
    try {
      const screen = await render(
        <button onClick={() => void audio.resume()}>音声入力を開始</button>,
      );
      await screen.getByRole("button", { name: "音声入力を開始" }).click();
      await expect.poll(() => audio.state).toBe("running");
      // running への遷移だけでなく、fixture の実音声が流れてから画面へ渡す。
      await expect
        .poll(() => {
          analyser.getByteTimeDomainData(samples);
          return samples.some((value) => value < 96);
        })
        .toBe(true);
      const track = destination.stream.getAudioTracks()[0];
      if (!track) throw new Error("実音声trackが必要です");
      await screen.rerender(
        <LocaleProvider initialLocale="ja" persist={false}>
          <MotionProvider>
            <VoicePanel
              view={
                status === "listening"
                  ? { status, inputTrack: track }
                  : { status, outputTrack: track }
              }
              lines={[]}
              onStart={() => {}}
              speechSpeed={1}
              onSpeedChange={() => {}}
              onMicrophoneChange={() => {}}
              onMicrophoneRefresh={() => {}}
            />
          </MotionProvider>
        </LocaleProvider>,
      );
      const figure = page.getByRole("figure").filter({
        hasText: status === "listening" ? ja.kiosk_voice_listening : ja.kiosk_voice_speaking,
      });
      await expect.element(figure).toBeVisible();
      expect(figure.element().getBoundingClientRect().width).toBeLessThanOrEqual(384);
      expect(figure.element().getBoundingClientRect().height).toBeLessThanOrEqual(48);
      await expect
        .element(page.getByRole("slider", { name: ja.kiosk_speech_speed }))
        .not.toBeInTheDocument();
      const microphone = page.getByRole("button", { name: ja.kiosk_input_settings });
      await expect.element(microphone).toBeVisible();
      const waveBounds = figure.element().getBoundingClientRect();
      const stop = page.getByRole("button", { name: ja.kiosk_voice_stop, exact: true });
      await expect.element(stop).toBeVisible();
      const controls = stop.element().closest("[data-theme-part=voice-controls]");
      if (!(controls instanceof HTMLElement)) throw new Error("音声操作バーが必要です");
      const controlHeight = controls.getBoundingClientRect().height;
      expect(controls.contains(figure.element())).toBe(true);
      expect(waveBounds.bottom).toBeLessThanOrEqual(stop.element().getBoundingClientRect().top);
      expect(stop.element().getBoundingClientRect().left).toBeLessThan(
        microphone.element().getBoundingClientRect().left,
      );
      await expect
        .poll(() => figure.element().querySelector("canvas[data-ui=audio-waveform]"))
        .toBeInstanceOf(HTMLCanvasElement);
      const canvas = figure.element().querySelector("canvas[data-ui=audio-waveform]");
      if (!(canvas instanceof HTMLCanvasElement)) throw new Error("波形canvasが必要です");
      await expect
        .poll(() => {
          const context = canvas.getContext("2d");
          if (!context) throw new Error("波形の描画contextが必要です");
          analyser.getByteTimeDomainData(samples);
          return {
            source: audio.state,
            sourceSignal: samples.some((value) => value < 96),
            visibility: document.visibilityState,
            motion: figure.element().getAttribute("data-motion"),
            waveform: context
              .getImageData(0, 0, canvas.width, 18)
              .data.some((value, index) => index % 4 === 3 && value > 0),
          };
        })
        .toEqual({
          source: "running",
          sourceSignal: true,
          visibility: "visible",
          motion: "animated",
          waveform: true,
        });
      await screen.rerender(
        <LocaleProvider initialLocale="ja" persist={false}>
          <MotionProvider>
            <VoicePanel
              view={{ status: "paused" }}
              lines={[]}
              onStart={() => {}}
              speechSpeed={1}
              onSpeedChange={() => {}}
              onMicrophoneChange={() => {}}
              onMicrophoneRefresh={() => {}}
            />
          </MotionProvider>
        </LocaleProvider>,
      );
      const resume = page.getByRole("button", { name: ja.kiosk_voice_resume, exact: true });
      await expect.element(resume).toBeVisible();
      expect(resume.element().closest("[data-theme-part=voice-controls]")).not.toBeNull();
      expect(document.querySelector('[data-theme-part="voice-controls"]')).toBe(controls);
      expect(controls.getBoundingClientRect().height).toBeLessThanOrEqual(controlHeight);
    } finally {
      oscillator.stop();
      oscillator.disconnect();
      analyser.disconnect();
      for (const track of destination.stream.getTracks()) track.stop();
      await audio.close();
    }
  },
);

it("音声開始が失敗しても実Queryのカートと画面操作を維持する", async () => {
  // APIの開始拒否まで実WebRTCを通し、captureと端末内推論の外部境界を固定する。
  const audio = new AudioContext();
  const stream = audio.createMediaStreamDestination().stream;
  const captures: MediaStream[] = [];
  vi.stubGlobal(
    "Worker",
    class extends EventTarget {
      postMessage() {}
      terminate() {}
    },
  );
  try {
    vi.spyOn(navigator.mediaDevices, "getUserMedia").mockImplementation(async () => {
      const capture = stream.clone();
      captures.push(capture);
      return capture;
    });
    await render(
      <LocaleProvider initialLocale="ja" persist={false}>
        <QueryClientProvider client={fixture.client}>
          <MotionProvider>
            <Kiosk />
          </MotionProvider>
        </QueryClientProvider>
      </LocaleProvider>,
    );
    await expect
      .element(page.getByRole("button", { name: ja.kiosk_welcome_start, exact: true }))
      .toBeVisible();
    const before = structuredClone(fixture.current.cart);
    await page.getByRole("button", { name: ja.kiosk_welcome_start, exact: true }).click();
    await expect
      .element(page.getByText(/音声サービスの準備が整い次第ご利用いただけます。/))
      .toBeVisible();
    await page.getByRole("tab", { name: ja.kiosk_menu, exact: true }).click();
    await expect
      .element(page.getByRole("tab", { name: ja.kiosk_menu, exact: true }))
      .toHaveAttribute("aria-selected", "true");
    expect(fixture.client.getQueryData<TableState>(["tablecast-table"])?.cart).toEqual(before);
    expect(requests.filter((request) => request.url.endsWith("/voice/start"))).toHaveLength(1);
    expect(captures.length).toBeGreaterThan(0);
    expect(
      captures.every((capture) =>
        capture.getTracks().every((track) => track.readyState === "ended"),
      ),
    ).toBe(true);
  } finally {
    for (const capture of captures) capture.getTracks().forEach((track) => track.stop());
    stream.getTracks().forEach((track) => track.stop());
    await audio.close();
  }
});

it("会話履歴の注文確認と音声エラーから下端の操作へ進める", async () => {
  await page.viewport(1024, 768);
  const review = vi.fn<() => void>();
  await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <div className="h-180 w-60">
        <MotionProvider>
          <VoicePanel
            view={{ status: "error", error: "permission" }}
            lines={[]}
            onStart={() => {}}
            onReview={review}
            snapshot={{
              id: "tablecast-voice-confirmation",
              tableSessionId: fixture.current.id,
              cartVersion: fixture.current.cart.version,
              configVersion: fixture.current.configVersion,
              lines: fixture.current.cart.lines,
              total: fixture.current.cart.total,
              locale: "ja",
              text: "確認待ちの注文内容",
              expiresAt: Date.now() + 60_000,
              channel: "voice",
              status: "pending",
              createdTurnId: "tablecast-voice-turn",
              plan: null,
            }}
          />
        </MotionProvider>
      </div>
    </LocaleProvider>,
  );
  await expect
    .element(page.getByRole("button", { name: ja.kiosk_history_show }))
    .not.toBeInTheDocument();
  await expect.element(page.getByText("確認待ちの注文内容")).toBeVisible();
  await expect
    .element(page.getByRole("status").filter({ hasText: ja.kiosk_voice_permission }))
    .toBeVisible();
  await page.getByRole("button", { name: ja.kiosk_review, exact: true }).click();
  expect(review).toHaveBeenCalledOnce();
});

it("字幕の文字列を追加すると入場後の吹き出しを不透明に描画する", async () => {
  const screen = await render(
    <LocaleProvider initialLocale="ja" persist={false}>
      <MotionProvider>
        <VoicePanel
          view={{
            status: "speaking",
            messages: [
              {
                id: "tablecast-visible-caption",
                role: "assistant",
                text: "ご注文を承ります",
                final: false,
                createdAt: Date.now(),
              },
            ],
          }}
          lines={[]}
          onStart={() => {}}
        />
      </MotionProvider>
    </LocaleProvider>,
  );
  const caption = screen.getByText("ご注文を承ります", { exact: true });
  await expect.element(caption).toBeVisible();
  await expect
    .poll(() => {
      const entry = caption.element().closest('[data-ui="conversation-entry"]');
      return entry ? getComputedStyle(entry).opacity : "";
    })
    .toBe("1");
});
