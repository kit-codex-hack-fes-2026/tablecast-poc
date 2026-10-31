import { vi } from "vitest";
import type { VoiceConnection } from "../voice-connection";
import { apiFetch } from "../../../lib/api-fetch";

class VoiceChannel extends EventTarget {
  readyState = "open";
  send = vi.fn<(data: string) => void>((data: string) => {
    const event: unknown = JSON.parse(data);
    if (event && typeof event === "object" && "type" in event && event.type === "session.close")
      this.receive({ type: "session.closed" });
  });
  close = vi.fn<() => void>(() => {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  });
  receive(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
  }
}

export class VoicePeer extends EventTarget {
  static instances: VoicePeer[] = [];
  channel = new VoiceChannel();
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  iceGatheringState = "complete";
  connectionState = "new";
  localDescription?: { sdp: string; type: string };
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  addTrack = vi.fn<(track: unknown, stream: unknown) => void>();
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  createDataChannel = vi.fn<() => VoiceChannel>(() => this.channel);
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  createOffer = vi.fn<() => Promise<{ sdp: string; type: string }>>(async () => ({
    type: "offer",
    sdp: "tablecast-offer",
  }));
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  setLocalDescription = vi.fn<(description: { sdp: string; type: string }) => Promise<void>>(
    async (description: { sdp: string; type: string }) => {
      this.localDescription = description;
    },
  );
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  setRemoteDescription = vi.fn<() => Promise<void>>(async () => {
    this.connectionState = "connected";
    this.channel.receive({ type: "session.started" });
  });
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  close = vi.fn<() => void>(() => {
    this.connectionState = "closed";
    this.dispatchEvent(new Event("connectionstatechange"));
  });
  constructor() {
    super();
    VoicePeer.instances.push(this);
  }
}

export class VoiceAudio {
  static instances: VoiceAudio[] = [];
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  autoplay = false;
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  srcObject: unknown = null;
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  play = vi.fn<() => Promise<void>>(async () => undefined);
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  pause = vi.fn<() => void>();
  constructor() {
    VoiceAudio.instances.push(this);
  }
}

export const track = {
  kind: "audio",
  label: "Built-in",
  addEventListener: vi.fn<() => void>(),
  stop: vi.fn<() => void>(),
};

export class VoiceMediaStream {
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  getTracks = () => [track];
  // vi.stubGlobalへ渡した標準transportから呼ばれる。
  // fallow-ignore-next-line unused-class-member
  getAudioTracks = () => [track];
}

const ignoreResolution = () => undefined;

export function deferred<T>() {
  let resolve: (value: T) => void = ignoreResolution;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

export function peer() {
  const value = VoicePeer.instances.at(-1);
  if (!value) throw new Error("音声接続がまだ作成されていない");
  return value;
}

export function voiceFixture() {
  vi.clearAllMocks();
  const requests: { body: unknown; path: string; signal: AbortSignal | null | undefined }[] = [];
  const connections: VoiceConnection[] = [];
  const capture = vi
    .fn<() => Promise<VoiceMediaStream>>()
    .mockResolvedValue(new VoiceMediaStream());
  VoicePeer.instances = [];
  VoiceAudio.instances = [];
  vi.stubGlobal("RTCPeerConnection", VoicePeer);
  vi.stubGlobal("Audio", VoiceAudio);
  vi.stubGlobal("MediaStream", VoiceMediaStream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: capture } });
  let issued = 0;
  vi.mocked(apiFetch).mockImplementation(async (input, options) => {
    const path = input instanceof Request ? input.url : String(input);
    requests.push({
      path,
      body: typeof options?.body === "string" ? JSON.parse(options.body) : undefined,
      signal: options?.signal,
    });
    if (path.endsWith("/start"))
      return Response.json({
        voiceSessionId: `live_tablecast_${++issued}`,
        sdp: "tablecast-answer",
        proactive: false,
      });
    if (path.endsWith("/delegations"))
      return Response.json({ kind: "accepted", turnId: "tablecast-turn" });
    if (path.endsWith("/tools")) return Response.json({ result: { products: [] } });
    if (["/finish", "/stop", "/conversation"].some((ending) => path.endsWith(ending)))
      return Response.json({ ok: true });
    return Response.json({ error: { code: "UNEXPECTED_TEST_REQUEST" } }, { status: 500 });
  });
  return {
    requests,
    connections,
    capture,
    dispose: async () => {
      for (const value of connections) await value.stop();
      vi.useRealTimers();
      vi.unstubAllGlobals();
      const unexpected = requests.filter(
        ({ path }) =>
          !["/start", "/stop", "/conversation", "/delegations", "/tools", "/finish"].some(
            (ending) => path.endsWith(ending),
          ),
      );
      if (unexpected.length)
        throw new Error(`未定義の要求: ${unexpected.map(({ path }) => path).join(", ")}`);
    },
  };
}
