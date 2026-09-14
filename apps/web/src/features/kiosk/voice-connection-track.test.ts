import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api-fetch";
import { VoiceConnection, type VoiceView } from "./voice-connection";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));

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
class VoicePeer extends EventTarget {
  static instances: VoicePeer[] = [];
  channel = new VoiceChannel();
  iceGatheringState = "complete";
  connectionState = "new";
  localDescription?: { type: string; sdp: string };
  sender = { replaceTrack: vi.fn<(track: SyntheticTrack) => Promise<void>>(async () => undefined) };
  addTrack = vi.fn<() => typeof this.sender>(() => this.sender);
  createDataChannel = vi.fn<() => VoiceChannel>(() => this.channel);
  createOffer = vi.fn<() => Promise<{ type: string; sdp: string }>>(async () => ({
    type: "offer",
    sdp: "tablecast-offer",
  }));
  setLocalDescription = vi.fn<(description: { type: string; sdp: string }) => Promise<void>>(
    async (description: { type: string; sdp: string }) => {
      this.localDescription = description;
    },
  );
  setRemoteDescription = vi.fn<() => Promise<void>>(async () => {
    this.connectionState = "connected";
    this.channel.receive({ type: "session.started" });
  });
  close = vi.fn<() => void>(() => {
    this.connectionState = "closed";
    this.dispatchEvent(new Event("connectionstatechange"));
  });
  constructor() {
    super();
    VoicePeer.instances.push(this);
  }
}
class VoiceAudio {
  static instances: VoiceAudio[] = [];
  autoplay = false;
  srcObject: unknown = null;
  play = vi.fn<() => Promise<void>>(async () => undefined);
  pause = vi.fn<() => void>();
  constructor() {
    VoiceAudio.instances.push(this);
  }
}

class SyntheticTrack extends EventTarget {
  kind = "audio";
  readyState = "live";
  constructor(public id = "built-in") {
    super();
  }
  get label() {
    return this.id;
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
  vi.fn<(constraints: { audio: { deviceId?: { exact: string } } }) => Promise<SyntheticStream>>();
const enumerateDevices = vi.fn<() => Promise<unknown[]>>();
let sources: SyntheticTrack[];
let changes: VoiceView[];
let connection: VoiceConnection;
let requests: { path: string }[];
function peer() {
  const current = VoicePeer.instances.at(-1);
  if (!current) throw new Error("音声接続がまだ作成されていない");
  return current;
}
beforeEach(() => {
  vi.clearAllMocks();
  VoicePeer.instances = [];
  VoiceAudio.instances = [];
  sources = [];
  changes = [];
  requests = [];
  connection = new VoiceConnection(
    (view) => changes.push(view),
    () => {},
  );
  getUserMedia.mockReset().mockImplementation(async ({ audio }) => {
    const source = new SyntheticTrack(audio.deviceId?.exact ?? "built-in");
    sources.push(source);
    return new SyntheticStream([source]);
  });
  enumerateDevices.mockReset().mockResolvedValue([
    { kind: "audioinput", deviceId: "built-in", label: "Built-in" },
    { kind: "audioinput", deviceId: "external", label: "External" },
  ]);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia,
      enumerateDevices,
      getSupportedConstraints: () => ({ deviceId: true }),
    },
  });
  vi.stubGlobal("RTCPeerConnection", VoicePeer);
  vi.stubGlobal("Audio", VoiceAudio);
  vi.stubGlobal("MediaStream", SyntheticStream);
  vi.mocked(apiFetch).mockImplementation(async (input) => {
    const path = input instanceof Request ? input.url : String(input);
    requests.push({ path });
    if (path.endsWith("/start"))
      return Response.json({
        voiceSessionId: "tablecast-test-session",
        sdp: "tablecast-answer",
        proactive: false,
      });
    if (path.endsWith("/stop")) return Response.json({ ok: true });
    throw new Error("未定義の要求");
  });
});
afterEach(async () => {
  await connection.stop();
  vi.unstubAllGlobals();
});

it("停止中の選択はcaptureせず明示開始と再開で反映する", async () => {
  await connection.selectMicrophone("external");
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(requests).toHaveLength(0);
  await connection.start("ja");
  expect(sources[0].id).toBe("external");
  await connection.stop();
  await connection.selectMicrophone("built-in");
  expect(getUserMedia).toHaveBeenCalledOnce();
  await connection.start("ja");
  expect(sources[1].id).toBe("built-in");
});

it("切断した入力は停止し遅延イベントでもcaptureを再開しない", async () => {
  await connection.start("ja");
  const source = sources[0];
  source.readyState = "ended";
  source.dispatchEvent(new Event("ended"));
  await connection.stop();
  source.dispatchEvent(new Event("ended"));
  expect(getUserMedia).toHaveBeenCalledOnce();
  expect(peer().connectionState).toBe("closed");
  expect(changes.at(-1)).toMatchObject({ status: "paused", microphone: { error: "disconnected" } });
});

it.each([
  { initial: "default", selected: "external", active: "external" },
  { initial: "external", selected: "default", active: "built-in" },
])(
  "会話中に$initialから$selectedへ入力を切り替え接続を保つ",
  async ({ initial, selected, active }) => {
    await connection.selectMicrophone(initial);
    await connection.start("ja");
    await connection.selectMicrophone(selected);
    expect(changes.at(-1)).toMatchObject({
      status: "listening",
      inputTrack: sources[1],
      microphone: { selectedId: selected, activeLabel: active, switching: false, error: undefined },
    });
    expect(peer().sender.replaceTrack).toHaveBeenCalledWith(sources[1]);
    expect(sources[1].id).toBe(active);
    expect(sources[0].readyState).toBe("ended");
    expect(sources[1].readyState).toBe("live");
    expect(getUserMedia).toHaveBeenCalledTimes(2);
    expect(peer().addTrack).toHaveBeenCalledOnce();
    expect(peer().close).not.toHaveBeenCalled();
    expect(requests).toHaveLength(1);
    sources[0].dispatchEvent(new Event("ended"));
    expect(changes.at(-1)?.status).toBe("listening");
    await connection.stop();
    expect(sources.every((source) => source.readyState === "ended")).toBe(true);
  },
);

it("入力取得待ちに停止したら遅着した入力を送信せず選択も戻さない", async () => {
  await connection.start("ja");
  const pending = Promise.withResolvers<SyntheticStream>();
  getUserMedia.mockReturnValueOnce(pending.promise);
  const switching = connection.selectMicrophone("external");
  await connection.stop();
  await connection.selectMicrophone("next-start");
  const source = new SyntheticTrack("external");
  pending.resolve(new SyntheticStream([source]));
  await switching;
  expect(source.readyState).toBe("ended");
  expect(peer().sender.replaceTrack).not.toHaveBeenCalled();
  expect(changes.at(-1)).toMatchObject({
    status: "paused",
    microphone: { selectedId: "next-start", switching: false },
  });
});

it.each(["成功", "失敗"])(
  "送信切替待ちに停止したら新旧入力を即時終了し遅い%sで再開しない",
  async (result) => {
    await connection.start("ja");
    const pending = Promise.withResolvers<void>();
    const previousPeer = peer();
    previousPeer.sender.replaceTrack.mockReturnValueOnce(pending.promise);
    const switching = connection.selectMicrophone("external");
    await vi.waitFor(() => expect(previousPeer.sender.replaceTrack).toHaveBeenCalledOnce());
    await connection.stop();
    expect(sources.every((source) => source.readyState === "ended")).toBe(true);
    await connection.start("ja");
    if (result === "成功") pending.resolve();
    else pending.reject(new Error("device lost"));
    await switching;
    expect(changes.at(-1)).toMatchObject({
      status: "listening",
      microphone: { selectedId: "default", activeLabel: "built-in", switching: false },
    });
    expect(sources[2].readyState).toBe("live");
    expect(peer().close).not.toHaveBeenCalled();
  },
);

it.each(["開始", "切替"])("%s時に指定と異なる入力が返されたら送信せず解放する", async (phase) => {
  if (phase === "切替") await connection.start("ja");
  const source = new SyntheticTrack("wrong-input");
  getUserMedia.mockResolvedValueOnce(new SyntheticStream([source]));
  await connection.selectMicrophone("external");
  if (phase === "開始") await connection.start("ja");
  expect(source.readyState).toBe("ended");
  expect(peer().sender.replaceTrack).not.toHaveBeenCalled();
  expect(changes.at(-1)?.microphone?.error).toBe("unsupported");
  expect(peer().connectionState).toBe("closed");
});

it.each([
  ["NotAllowedError", "permission"],
  ["NotFoundError", "empty"],
  ["OverconstrainedError", "disconnected"],
  ["NotReadableError", "failed"],
])("切替の%sでは音声を停止し原因%sを表示する", async (name, error) => {
  await connection.start("ja");
  getUserMedia.mockRejectedValueOnce(new DOMException("test", name));
  await connection.selectMicrophone("external");
  expect(changes.at(-1)).toMatchObject({
    status: "paused",
    microphone: { error, switching: false },
  });
  expect(sources[0].readyState).toBe("ended");
});

it("送信切替の失敗では新旧入力を解放して明示再開を待つ", async () => {
  await connection.start("ja");
  peer().sender.replaceTrack.mockRejectedValueOnce(
    new DOMException("test", "InvalidModificationError"),
  );
  await connection.selectMicrophone("external");
  expect(sources.every((source) => source.readyState === "ended")).toBe(true);
  expect(changes.at(-1)).toMatchObject({
    status: "paused",
    microphone: { error: "failed", switching: false },
  });
});
it("停止中の一覧取得は許可やcaptureを要求せず切断した選択を知らせる", async () => {
  enumerateDevices.mockResolvedValue([
    { kind: "audioinput", deviceId: "built-in", label: "Built-in" },
  ]);
  await connection.selectMicrophone("external");
  await connection.refreshMicrophones();
  expect(changes.at(-1)).toMatchObject({
    status: "idle",
    microphone: { error: "disconnected", selectedId: "external" },
  });
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(requests).toHaveLength(0);
});

it.each(["NotReadableError", "NotAllowedError"])(
  "一覧取得の%sは再取得成功で解除しcaptureを開始しない",
  async (name) => {
    enumerateDevices
      .mockRejectedValueOnce(new DOMException("test", name))
      .mockResolvedValue([{ kind: "audioinput", deviceId: "built-in", label: "Built-in" }]);
    await connection.refreshMicrophones();
    expect(changes.at(-1)?.microphone?.error).toBeDefined();

    await connection.refreshMicrophones();

    expect(changes.at(-1)).toMatchObject({
      status: "idle",
      microphone: { loading: false, error: undefined, permissionRequired: false },
    });
    expect(changes.at(-1)?.microphone?.devices).toHaveLength(1);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  },
);

it("一覧取得の失敗後にcaptureが失敗した場合、一覧が復旧してもcaptureのエラーを残す", async () => {
  enumerateDevices
    .mockRejectedValueOnce(new DOMException("test", "NotReadableError"))
    .mockResolvedValue([{ kind: "audioinput", deviceId: "built-in", label: "Built-in" }]);
  getUserMedia.mockRejectedValueOnce(new DOMException("test", "NotReadableError"));
  await connection.refreshMicrophones();
  await connection.start("ja");
  expect(changes.at(-1)?.microphone?.error).toBe("failed");

  await connection.refreshMicrophones();

  expect(changes.at(-1)?.microphone).toMatchObject({ loading: false, error: "failed" });
  expect(getUserMedia).toHaveBeenCalledOnce();
});

it("古いデバイス一覧で新しい一覧を上書きしない", async () => {
  const pending = Promise.withResolvers<unknown[]>();
  enumerateDevices
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce([
      { kind: "audioinput", deviceId: "current", label: "Current microphone" },
    ]);
  const older = connection.refreshMicrophones();
  await connection.refreshMicrophones();
  pending.resolve([]);
  await older;
  expect(changes.at(-1)?.microphone?.devices).toEqual([
    { kind: "audioinput", deviceId: "current", label: "Current microphone" },
  ]);
  expect(changes.at(-1)?.microphone?.error).toBeUndefined();
});
