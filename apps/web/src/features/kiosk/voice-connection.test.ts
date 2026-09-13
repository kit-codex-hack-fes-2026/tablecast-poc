import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceConnection, type VoiceView } from "./voice-connection";
import { apiFetch } from "../../lib/api-fetch";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));

type TestMicrophone = {
  stop: () => void;
  on: (event: string, listener: () => void) => void;
  setDeviceId: (deviceId: string | { exact: string }) => Promise<boolean>;
  mediaStreamTrack: { label: string; getSettings: () => { deviceId: string } };
};
const transport = vi.hoisted(() => ({
  connect: vi.fn<(url: string, token: string) => Promise<void>>(),
  disconnect: vi.fn<(stopTracks: boolean) => Promise<void>>(),
  publish: vi.fn<(track: unknown) => Promise<void>>(),
  capture: vi.fn<(options: { deviceId?: { exact: string } }) => Promise<TestMicrophone>>(),
  stop: vi.fn<() => void>(),
  trackOn: vi.fn<(event: string, listener: () => void) => void>(),
  setDeviceId: vi.fn<(deviceId: string | { exact: string }) => Promise<boolean>>(),
  startAudio: vi.fn<() => Promise<void>>(),
  on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
}));
vi.mock("livekit-client", () => ({
  RemoteAudioTrack: vi.fn<() => void>(),
  Room: class {
    connect = transport.connect;
    disconnect = transport.disconnect;
    on = transport.on;
    startAudio = transport.startAudio;
    localParticipant = { publishTrack: transport.publish };
  },
  RoomEvent: {
    TrackSubscribed: "track",
    TrackUnsubscribed: "untrack",
    ParticipantAttributesChanged: "state",
    TranscriptionReceived: "transcription",
    DataReceived: "data",
    Disconnected: "disconnected",
  },
  TrackEvent: { Ended: "ended", Restarted: "restarted" },
  Track: { Kind: { Audio: "audio" } },
  createLocalAudioTrack: transport.capture,
}));

const ignoreResolution = () => undefined;
function deferred<T>() {
  let resolve: (value: T) => void = ignoreResolution;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("音声の明示的な停止と再開", () => {
  let requests: { path: string; body: unknown }[];
  beforeEach(() => {
    vi.clearAllMocks();
    // 音声状態だけを検証し、SSR/ブラウザーのHTTP接続は実経路の試験へ分離する。
    requests = [];
    transport.connect.mockResolvedValue(undefined);
    transport.disconnect.mockResolvedValue(undefined);
    transport.publish.mockResolvedValue(undefined);
    transport.startAudio.mockResolvedValue(undefined);
    transport.setDeviceId.mockResolvedValue(true);
    transport.capture.mockImplementation(async (options) => ({
      stop: transport.stop,
      on: transport.trackOn,
      setDeviceId: transport.setDeviceId,
      mediaStreamTrack: {
        label: "Built-in microphone",
        getSettings: () => ({ deviceId: options.deviceId?.exact ?? "built-in" }),
      },
    }));
    let issued = 0;
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      const path = input instanceof Request ? input.url : String(input);
      requests.push({
        path,
        body: typeof options?.body === "string" ? JSON.parse(options.body) : undefined,
      });
      return Response.json(
        path.endsWith("/start")
          ? {
              voiceSessionId: `tablecast-voice-${++issued}`,
              url: "ws://tablecast.localhost",
              token: "test-only",
            }
          : path.endsWith("/stop")
            ? { ok: true }
            : { error: { code: "UNEXPECTED_TEST_REQUEST" } },
        { status: path.endsWith("/start") || path.endsWith("/stop") ? 200 : 500 },
      );
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    const unexpected = requests.filter(
      ({ path }) => !path.endsWith("/start") && !path.endsWith("/stop"),
    );
    if (unexpected.length)
      throw new Error(`未定義の要求: ${unexpected.map(({ path }) => path).join(", ")}`);
  });

  it("マイク許可待ちに停止した場合は遅れて取得したトラックを送信せず終了する", async () => {
    const pending = deferred<TestMicrophone>();
    transport.capture.mockReturnValue(pending.promise);
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    const starting = connection.start("ja");
    await vi.waitFor(() => expect(transport.capture).toHaveBeenCalledOnce());
    await connection.stop();
    pending.resolve({
      stop: transport.stop,
      on: transport.trackOn,
      setDeviceId: transport.setDeviceId,
      mediaStreamTrack: {
        label: "Built-in microphone",
        getSettings: () => ({ deviceId: "built-in" }),
      },
    });
    await starting;
    expect(transport.publish).not.toHaveBeenCalled();
    expect(transport.stop).toHaveBeenCalledOnce();
    expect(changes.at(-1)?.status).toBe("paused");
  });

  it("停止はcaptureを終了し明示再開だけが新しいsessionを発行する", async () => {
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    await connection.stop();
    expect(transport.stop).toHaveBeenCalledOnce();
    expect(transport.disconnect).toHaveBeenCalledWith(true);
    expect(requests.filter((request) => request.path.endsWith("/start"))).toHaveLength(1);
    await connection.start("en");
    expect(requests.filter((request) => request.path.endsWith("/start"))).toEqual([
      { path: "/api/table/voice/start", body: undefined },
      { path: "/api/table/voice/start", body: undefined },
    ]);
    expect(changes.at(-1)?.status).toBe("listening");
    await connection.stop();
  });

  it("開始を連打しても接続とマイク送信は一度だけ行う", async () => {
    const connection = new VoiceConnection(vi.fn<(view: VoiceView) => void>(), vi.fn<() => void>());
    await Promise.all([connection.start("ja"), connection.start("ja")]);
    expect(transport.connect).toHaveBeenCalledOnce();
    expect(transport.publish).toHaveBeenCalledOnce();
    await connection.stop();
  });

  it("停止中の選択はcaptureせず、明示開始と再開に選択を反映する", async () => {
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.selectMicrophone("external");
    expect(transport.capture).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
    await connection.start("ja");
    expect(transport.capture).toHaveBeenLastCalledWith(
      expect.objectContaining({ deviceId: { exact: "external" } }),
    );
    await connection.stop();
    await connection.selectMicrophone("built-in");
    expect(changes.at(-1)?.status).toBe("paused");
    expect(transport.capture).toHaveBeenCalledOnce();
    await connection.start("ja");
    expect(transport.capture).toHaveBeenLastCalledWith(
      expect.objectContaining({ deviceId: { exact: "built-in" } }),
    );
    await connection.stop();
  });

  it("会話中は同じsessionの入力を切り替える", async () => {
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    await connection.selectMicrophone("external");
    expect(transport.setDeviceId).toHaveBeenCalledWith({ exact: "external" });
    expect(requests.filter(({ path }) => path.endsWith("/start"))).toHaveLength(1);
    expect(changes.at(-1)).toMatchObject({
      status: "listening",
      microphone: { selectedId: "external", switching: false },
    });
    await connection.stop();
  });

  it("開始時に指定と異なる入力が返されたら送信せず停止する", async () => {
    transport.capture.mockResolvedValueOnce({
      stop: transport.stop,
      on: transport.trackOn,
      setDeviceId: transport.setDeviceId,
      mediaStreamTrack: {
        label: "Built-in microphone",
        getSettings: () => ({ deviceId: "built-in" }),
      },
    });
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.selectMicrophone("external");
    await connection.start("ja");
    expect(transport.publish).not.toHaveBeenCalled();
    expect(transport.stop).toHaveBeenCalledOnce();
    expect(changes.at(-1)).toMatchObject({
      status: "error",
      microphone: { selectedId: "external", error: "unsupported" },
    });
  });

  it("切替中に停止したら遅い完了でcaptureや選択状態を復活させない", async () => {
    const pending = deferred<boolean>();
    transport.setDeviceId.mockReturnValueOnce(pending.promise);
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    const switching = connection.selectMicrophone("external");
    await connection.stop();
    await connection.selectMicrophone("next-start");
    pending.resolve(true);
    await switching;
    expect(transport.stop).toHaveBeenCalledTimes(2);
    expect(transport.disconnect).toHaveBeenCalledWith(true);
    expect(transport.publish).toHaveBeenCalledOnce();
    expect(changes.at(-1)).toMatchObject({
      status: "paused",
      microphone: { selectedId: "next-start", switching: false },
    });
  });

  it("旧sessionの切替失敗は停止後に再開したsessionを停止しない", async () => {
    let rejectSwitch: (reason: Error) => void = ignoreResolution;
    transport.setDeviceId.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectSwitch = reject;
      }),
    );
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    const switching = connection.selectMicrophone("external");
    await connection.stop();
    await connection.start("ja");
    rejectSwitch(new Error("device lost"));
    await switching;
    expect(changes.at(-1)?.status).toBe("listening");
    expect(transport.disconnect).toHaveBeenCalledOnce();
    await connection.stop();
  });

  it.each([
    ["NotAllowedError", "permission"],
    ["NotFoundError", "empty"],
    ["OverconstrainedError", "disconnected"],
    ["NotReadableError", "failed"],
  ])("切替の%sでは音声を停止し原因%sを表示する", async (name, error) => {
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    transport.setDeviceId.mockRejectedValueOnce(new DOMException("test", name));
    await connection.selectMicrophone("external");
    expect(changes.at(-1)).toMatchObject({
      status: "paused",
      microphone: { error, switching: false },
    });
    expect(transport.stop).toHaveBeenCalledOnce();
  });

  it("ブラウザーが指定マイクへの切替を反映しない場合は成功表示しない", async () => {
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    transport.setDeviceId.mockResolvedValueOnce(false);
    await connection.selectMicrophone("external");
    expect(changes.at(-1)).toMatchObject({
      status: "paused",
      microphone: { error: "unsupported", selectedId: "default" },
    });
  });

  it("入力トラック切断は音声を停止し明示再開まで再接続しない", async () => {
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    const ended = transport.trackOn.mock.calls.find(([event]) => event === "ended")?.[1];
    expect(ended).toBeDefined();
    ended?.();
    await connection.stop();
    expect(changes.at(-1)).toMatchObject({
      status: "paused",
      microphone: { error: "disconnected" },
    });
    const restarted = transport.trackOn.mock.calls.find(([event]) => event === "restarted")?.[1];
    expect(restarted).toBeDefined();
    restarted?.();
    expect(transport.stop).toHaveBeenCalledTimes(2);
    expect(changes.at(-1)?.status).toBe("paused");
    expect(transport.capture).toHaveBeenCalledOnce();
  });

  it("停止中の一覧取得は許可やcaptureを要求せず切断した選択を知らせる", async () => {
    const enumerateDevices = vi
      .fn<() => Promise<unknown[]>>()
      .mockResolvedValue([{ kind: "audioinput", deviceId: "built-in", label: "Built-in" }]);
    const getUserMedia = vi.fn<() => Promise<void>>();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        enumerateDevices,
        getUserMedia,
        getSupportedConstraints: () => ({ deviceId: true }),
      },
    });
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.selectMicrophone("external");
    await connection.refreshMicrophones();
    expect(changes.at(-1)).toMatchObject({
      status: "idle",
      microphone: { error: "disconnected", selectedId: "external" },
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(transport.capture).not.toHaveBeenCalled();
    expect(requests).toHaveLength(0);
  });

  it("古いデバイス一覧で新しい一覧を上書きしない", async () => {
    const pending = deferred<unknown[]>();
    const enumerateDevices = vi
      .fn<() => Promise<unknown[]>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce([
        { kind: "audioinput", deviceId: "current", label: "Current microphone" },
      ]);
    vi.stubGlobal("navigator", {
      mediaDevices: { enumerateDevices, getSupportedConstraints: () => ({ deviceId: true }) },
    });
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    const older = connection.refreshMicrophones();
    await connection.refreshMicrophones();
    pending.resolve([]);
    await older;
    expect(changes.at(-1)?.microphone?.devices).toEqual([
      { kind: "audioinput", deviceId: "current", label: "Current microphone" },
    ]);
    expect(changes.at(-1)?.microphone?.error).toBeUndefined();
  });

  it("設定不足は成功扱いにせずGUIを維持できる音声エラーとして通知する", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(
      Response.json({ error: { code: "VOICE_NOT_CONFIGURED" } }, { status: 503 }),
    );
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    expect(transport.capture).not.toHaveBeenCalled();
    expect(changes.at(-1)).toEqual({ status: "error", error: "unconfigured" });
  });
  it("別の音声接続が有効な場合は勝手に停止せず明示停止後にだけ再開できる", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(
      Response.json({ error: { code: "VOICE_ALREADY_ACTIVE" } }, { status: 409 }),
    );
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    expect(changes.at(-1)).toEqual({ status: "error", error: "active" });
    expect(transport.capture).not.toHaveBeenCalled();
    expect(requests.filter((request) => request.path.endsWith("/stop"))).toHaveLength(0);
    await connection.stop({ existingSession: true });
    expect(requests.filter((request) => request.path.endsWith("/stop"))).toHaveLength(1);
    await connection.start("ja");
    expect(transport.capture).toHaveBeenCalledOnce();
    await connection.stop();
  });
  it("サーバーで停止された音声は端末のcaptureも終了し別sessionへ停止要求を送らない", async () => {
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    connection.synchronise("tablecast-other-session", true);
    await vi.waitFor(() => expect(changes.at(-1)?.status).toBe("paused"));
    expect(transport.stop).toHaveBeenCalledOnce();
    expect(requests.filter((request) => request.path.endsWith("/stop"))).toHaveLength(0);
  });
  it("Agentの逐次本文は状態変更でも保持し停止後の遅延パケットを無視する", async () => {
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    transport.on.mockImplementation((event, listener) => {
      callbacks.set(event, listener);
    });
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    const packet = new TextEncoder().encode(
      JSON.stringify({
        type: "assistant",
        turnId: "tablecast-turn",
        text: "こちらを",
        rawText: "[warm]こちらを",
        final: false,
      }),
    );
    callbacks.get("data")?.(packet, { isAgent: false }, undefined, "tablecast.voice");
    expect(changes.at(-1)?.messages).toBeUndefined();
    callbacks.get("data")?.(packet, { isAgent: true }, undefined, "tablecast.voice");
    callbacks.get("state")?.({ "lk.agent.state": "speaking" }, { isAgent: true });
    expect(changes.at(-1)?.messages?.[0]).toMatchObject({
      text: "こちらを",
      rawText: "[warm]こちらを",
      final: false,
    });
    expect(changes.at(-1)?.status).toBe("speaking");
    await connection.stop();
    callbacks.get("data")?.(packet, { isAgent: true }, undefined, "tablecast.voice");
    expect(changes.at(-1)?.status).toBe("paused");
    expect(changes.at(-1)?.messages?.[0]).toMatchObject({ final: true, interrupted: true });
  });
  it("字幕の容量超過は音声の中断と区別し確定済みの客発話を変えない", async () => {
    const callbacks = new Map<string, (...args: unknown[]) => void>();
    transport.on.mockImplementation((event, listener) => {
      callbacks.set(event, listener);
    });
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("en");
    const deliver = (data: unknown) =>
      callbacks.get("data")?.(
        new TextEncoder().encode(JSON.stringify(data)),
        { isAgent: true },
        undefined,
        "tablecast.voice",
      );
    deliver({
      type: "user",
      id: "tablecast-user",
      turnId: "tablecast-turn",
      text: "Sake please",
      final: true,
    });
    deliver({
      type: "assistant",
      turnId: "tablecast-turn",
      text: "Here are",
      rawText: "Here are",
      final: false,
    });
    deliver({ type: "error", turnId: "tablecast-turn", code: "VOICE_TEXT_TOO_LARGE" });
    expect(changes.at(-1)?.messages?.[0]).toMatchObject({
      role: "user",
      final: true,
      locale: "en",
    });
    expect(changes.at(-1)?.messages?.[0]?.interrupted).toBeUndefined();
    expect(changes.at(-1)?.messages?.[1]).toMatchObject({
      interrupted: false,
      displayIncomplete: true,
      final: true,
    });
    deliver({ type: "interrupted", turnId: "tablecast-turn" });
    expect(changes.at(-1)?.messages?.[0]?.interrupted).toBeUndefined();
    expect(changes.at(-1)?.messages?.[1]).toMatchObject({
      interrupted: true,
      displayIncomplete: false,
    });
    await connection.stop();
  });
});
