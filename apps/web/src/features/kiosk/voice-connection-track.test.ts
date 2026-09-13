import { afterEach, expect, it, vi } from "vitest";
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
  id = "tablecast-microphone";
  label = "Synthetic microphone";
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

let connection: VoiceConnection | undefined;
afterEach(async () => {
  await connection?.stop();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("切断した入力をSDK管理にせず、停止後のunmuteでもcaptureを再開しない", async () => {
  vi.stubGlobal("MediaStream", SyntheticStream);
  vi.stubGlobal("MediaStreamTrack", SyntheticTrack);
  const source = new SyntheticTrack();
  const getUserMedia = vi.fn<() => Promise<SyntheticStream>>(
    async () => new SyntheticStream([new SyntheticTrack()]),
  );
  getUserMedia.mockResolvedValueOnce(new SyntheticStream([source]));
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia,
      enumerateDevices: async () => [
        { kind: "audioinput", deviceId: source.id, label: source.label },
      ],
      getSupportedConstraints: () => ({ deviceId: true }),
    },
  });
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
  const changes: VoiceView[] = [];
  connection = new VoiceConnection(
    (view) => changes.push(view),
    () => {},
  );
  await connection.start("ja");
  expect(transport.publish).toHaveBeenCalledOnce();
  const track = transport.publish.mock.calls[0][0];

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
