import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render } from "vitest-browser-react";
import type { StandbyInput, StandbyOutput, StandbyStatus } from "./standby-model";
import { KioskVoicePanel } from "./kiosk-voice-panel";
import { LocalStandby } from "./standby-capture";
import { Surface } from "./test-support/voice-panel-fixture";
import { VoiceConnection } from "./voice-connection";

vi.mock("@ricky0123/vad-web", () => ({
  MicVAD: {
    new: vi.fn<() => Promise<{ destroy: () => Promise<void>; start: () => Promise<void> }>>(
      async () => ({
        start: vi.fn<() => Promise<void>>(async () => {}),
        destroy: vi.fn<() => Promise<void>>(async () => {}),
      }),
    ),
  },
}));
const workers: InferenceWorker[] = [];
class InferenceWorker extends EventTarget {
  constructor() {
    super();
    workers.push(this);
  }
  terminate = vi.fn<() => void>();
  postMessage(input: StandbyInput) {
    if (input.type === "init") queueMicrotask(() => this.receive({ type: "ready" }));
    if (input.type === "frame") input.bitmap.close();
  }
  receive(output: StandbyOutput) {
    this.dispatchEvent(new MessageEvent("message", { data: output }));
  }
}
const captures: LocalStandby[] = [];
const streams: MediaStream[] = [];
const contexts: AudioContext[] = [];
afterEach(async () => {
  await cleanup();
  for (const capture of captures.splice(0)) await capture.stop();
  for (const stream of streams.splice(0)) stream.getTracks().forEach((track) => track.stop());
  for (const context of contexts.splice(0)) await context.close();
  workers.splice(0);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup() {
  vi.stubGlobal("Worker", InferenceWorker);
  const mediaDevices = navigator.mediaDevices;
  vi.stubGlobal("navigator", { gpu: true, mediaDevices });
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  canvas.getContext("2d")?.fillRect(0, 0, 640, 480);
  const context = new AudioContext();
  contexts.push(context);
  const stream = canvas.captureStream();
  const destination = context.createMediaStreamDestination();
  for (const track of destination.stream.getAudioTracks()) stream.addTrack(track);
  streams.push(stream);
  const captureMedia = vi.spyOn(navigator.mediaDevices, "getUserMedia").mockResolvedValue(stream);
  const statuses: StandbyStatus[] = [];
  const activated = vi.fn<ConstructorParameters<typeof LocalStandby>[1]>(async () => {});
  const capture = new LocalStandby((status) => statuses.push(status), activated);
  captures.push(capture);
  return { stream, captureMedia, statuses, activated, capture };
}
it("待受のマイクを一回だけ取得し、接続への引渡しでは映像だけを解放する", async () => {
  const { stream, capture, captureMedia, statuses, activated } = setup();
  await capture.start();
  expect(statuses.at(-1)).toBe("armed");
  const vision = workers[0];
  if (!vision) throw new Error("映像Workerがありません");
  await expect
    .poll(
      () => {
        vision.receive({
          type: "frame",
          observation: {
            at: performance.now(),
            person: 1,
            score: 1,
            attention: 0.8,
            raised: true,
            crossed: false,
            mouth: 0,
          },
        });
        return activated.mock.calls.length;
      },
      { timeout: 2500 },
    )
    .toBe(1);
  expect(captureMedia).toHaveBeenCalledOnce();
  expect(stream.getVideoTracks().every((track) => track.readyState === "ended")).toBe(true);
  expect(stream.getAudioTracks().every((track) => track.readyState === "live")).toBe(true);
  expect(workers.every((worker) => worker.terminate.mock.calls.length > 0)).toBe(true);
});
it("許可待ちの明示停止後に届いたメディアを直ちに解放して接続しない", async () => {
  const { stream, capture, captureMedia, statuses, activated } = setup();
  let release: ((stream: MediaStream) => void) | undefined;
  captureMedia.mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const starting = capture.start();
  await expect.poll(() => captureMedia.mock.calls.length).toBe(1);
  await capture.stop();
  release?.(stream);
  await starting;
  expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
  expect(activated).not.toHaveBeenCalled();
  expect(statuses).not.toContain("armed");
});
it("推論失敗では取得済みの全トラックを停止する", async () => {
  const { stream, capture, statuses } = setup();
  await capture.start();
  workers[0]?.receive({ type: "error" });
  await expect.poll(() => statuses.at(-1)).toBe("error");
  expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
});

it("初期画面で自動待受し、既存の音声ボタンで停止した後は再描画でも再開しない", async () => {
  const { stream, captureMedia } = setup();
  const voice = new VoiceConnection(
    () => {},
    () => {},
  );
  const start = vi.fn<() => void>();
  const panel = () => (
    <Surface>
      <KioskVoicePanel voice={voice} lines={[]} onWakeLanguage={async () => {}} onStart={start} />
    </Surface>
  );
  const screen = await render(panel());
  await expect.poll(() => captureMedia.mock.calls.length).toBe(1);
  const stop = screen.getByRole("button", { name: "音声を停止", exact: true });
  await expect.element(stop).toBeVisible();
  expect(stop.element().closest("footer")?.querySelectorAll("button")).toHaveLength(1);
  await expect.element(screen.getByText(/すみませんと声をかけるか/)).toBeVisible();
  await stop.click();
  expect(stream.getTracks().every((track) => track.readyState === "ended")).toBe(true);
  await screen.rerender(panel());
  await expect
    .element(screen.getByRole("button", { name: "音声を再開", exact: true }))
    .toBeVisible();
  expect(captureMedia).toHaveBeenCalledOnce();
  expect(start).not.toHaveBeenCalled();
  await voice.stop();
});

it("利用客の確認待ちは取得せず、確認後の初期画面でだけ自動待受する", async () => {
  const { captureMedia } = setup();
  const voice = new VoiceConnection(
    () => {},
    () => {},
  );
  const panel = (blocked: boolean) => (
    <Surface>
      <KioskVoicePanel
        voice={voice}
        lines={[]}
        standbyBlocked={blocked}
        onWakeLanguage={async () => {}}
        onStart={() => {}}
      />
    </Surface>
  );
  const screen = await render(panel(true));
  expect(captureMedia).not.toHaveBeenCalled();
  await screen.rerender(panel(false));
  await expect.poll(() => captureMedia.mock.calls.length).toBe(1);
  await screen.getByRole("button", { name: "音声を停止", exact: true }).click();
  await voice.stop();
});
