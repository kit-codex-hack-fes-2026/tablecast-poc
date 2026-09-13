import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type * as LiveKit from "livekit-client";
import { apiFetch } from "../../lib/api-fetch";
import { VoiceConnection, type VoiceView } from "./voice-connection";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
const transport = vi.hoisted(() => ({
  publish: vi.fn<(track: LiveKit.LocalAudioTrack) => Promise<void>>(),
  disconnect: vi.fn<() => Promise<void>>(),
}));
vi.mock("livekit-client", async (importOriginal) => {
  const sdk = await importOriginal<typeof LiveKit>();
  return {
    ...sdk,
    Room: class {
      on() {}
      async connect() {}
      async startAudio() {}
      disconnect = transport.disconnect;
      localParticipant = { publishTrack: transport.publish };
    },
  };
});

// OSのcaptureだけを合成し、LocalAudioTrackの停止・復旧処理は実SDKを通す。
class SyntheticTrack extends EventTarget {
  kind = "audio";
  constructor(public id = "tablecast-microphone") {
    super();
  }
  get label() {
    return this.id;
  }
  enabled = true;
  readyState = "live";
  getConstraints() {
    return { deviceId: this.id };
  }
  getSettings() {
    return { deviceId: this.id };
  }
  stop() {
    this.readyState = "ended";
  }
}
class SyntheticStream {
  constructor(private tracks: SyntheticTrack[]) {}
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks;
  }
}

const getUserMedia =
  vi.fn<
    (constraints: { audio: { deviceId?: string | { exact: string } } }) => Promise<SyntheticStream>
  >();
let sources: SyntheticTrack[];
let changes: VoiceView[];
let connection: VoiceConnection;
beforeEach(() => {
  sources = [];
  changes = [];
  connection = new VoiceConnection(
    (view) => changes.push(view),
    () => {},
  );
  getUserMedia.mockImplementation(async ({ audio }) => {
    const requested = typeof audio.deviceId === "string" ? audio.deviceId : audio.deviceId?.exact;
    const source = new SyntheticTrack(
      requested && requested !== "default" ? requested : "built-in",
    );
    sources.push(source);
    return new SyntheticStream([source]);
  });
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia,
      enumerateDevices: async () => [
        { kind: "audioinput", deviceId: "built-in", label: "Built-in" },
        { kind: "audioinput", deviceId: "external", label: "External" },
      ],
      getSupportedConstraints: () => ({ deviceId: true }),
    },
  });
  vi.stubGlobal("MediaStream", SyntheticStream);
  vi.stubGlobal("MediaStreamTrack", SyntheticTrack);
  transport.publish.mockResolvedValue(undefined);
  transport.disconnect.mockResolvedValue(undefined);
  vi.mocked(apiFetch).mockImplementation(async (input) => {
    const path = input instanceof Request ? input.url : String(input);
    if (path.endsWith("/start"))
      return Response.json({
        voiceSessionId: "tablecast-test-session",
        token: "test-only",
        url: "ws://tablecast.localhost",
      });
    if (path.endsWith("/stop")) return Response.json({ ok: true });
    throw new Error("未定義の要求");
  });
});
afterEach(async () => {
  await connection.stop();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("切断した入力をSDK管理にせず、停止後のunmuteでもcaptureを再開しない", async () => {
  await connection.start("ja");
  expect(transport.publish).toHaveBeenCalledOnce();
  const track = transport.publish.mock.calls[0][0];

  const source = sources[0];
  source.readyState = "ended";
  source.dispatchEvent(new Event("ended"));
  await connection.stop();
  // Endedの自動復旧とunmuteは、この公開された所有権で再取得の可否を判断する。
  await track.mute();
  await track.unmute();

  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(track.isUserProvided).toBe(true);
  expect(track.mediaStreamTrack.readyState).toBe("ended");
  expect(changes.at(-1)).toMatchObject({
    status: "paused",
    microphone: { error: "disconnected" },
  });
});

it.each([
  { initial: "default", selected: "external", active: "external" },
  { initial: "external", selected: "default", active: "built-in" },
])(
  "会話中に$initialから$selectedへ実SDKで入力を切り替え接続を保つ",
  async ({ initial, selected, active }) => {
    await connection.selectMicrophone(initial);
    await connection.start("ja");
    expect(changes.at(-1)?.status).toBe("listening");
    const track = transport.publish.mock.calls[0][0];

    await connection.selectMicrophone(selected);

    expect(changes.at(-1)).toMatchObject({
      status: "listening",
      inputTrack: track,
      microphone: { selectedId: selected, activeLabel: active, switching: false, error: undefined },
    });
    expect(track.mediaStreamTrack.getSettings().deviceId).toBe(active);
    expect(track.mediaStreamTrack.readyState).toBe("live");
    expect(track.isUserProvided).toBe(true);
    expect(sources[0].readyState).toBe("ended");
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(transport.publish).toHaveBeenCalledOnce();
    expect(transport.disconnect).not.toHaveBeenCalled();
    expect(apiFetch).toHaveBeenCalledOnce();

    await connection.stop();
    expect(sources.every((source) => source.readyState === "ended")).toBe(true);
  },
);
