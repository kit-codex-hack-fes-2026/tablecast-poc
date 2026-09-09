import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceConnection, type VoiceView } from "./voice-connection";

const transport = vi.hoisted(() => ({
  connect: vi.fn<(url: string, token: string) => Promise<void>>(),
  disconnect: vi.fn<(stopTracks: boolean) => Promise<void>>(),
  publish: vi.fn<(track: unknown) => Promise<void>>(),
  capture: vi.fn<() => Promise<{ stop: () => void }>>(),
  stop: vi.fn<() => void>(),
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
    requests = [];
    transport.connect.mockResolvedValue(undefined);
    transport.disconnect.mockResolvedValue(undefined);
    transport.publish.mockResolvedValue(undefined);
    transport.startAudio.mockResolvedValue(undefined);
    transport.capture.mockResolvedValue({ stop: transport.stop });
    let issued = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: string, options: RequestInit) => {
        requests.push({
          path,
          body: typeof options.body === "string" ? JSON.parse(options.body) : undefined,
        });
        return Response.json(
          path.endsWith("/start")
            ? {
                voiceSessionId: `tablecast-voice-${++issued}`,
                url: "ws://tablecast.localhost",
                token: "test-only",
              }
            : { ok: true },
        );
      }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("マイク許可待ちに停止した場合は遅れて取得したトラックを送信せず終了する", async () => {
    const pending = deferred<{ stop: () => void }>();
    transport.capture.mockReturnValue(pending.promise);
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    const starting = connection.start("ja");
    await vi.waitFor(() => expect(transport.capture).toHaveBeenCalledOnce());
    await connection.stop();
    pending.resolve({ stop: transport.stop });
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

  it("設定不足は成功扱いにせずGUIを維持できる音声エラーとして通知する", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json({ error: { code: "VOICE_NOT_CONFIGURED" } }, { status: 503 }),
    );
    const changes: VoiceView[] = [];
    const connection = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
    await connection.start("ja");
    expect(transport.capture).not.toHaveBeenCalled();
    expect(changes.at(-1)).toEqual({ status: "error", error: "unconfigured" });
  });
  it("別の音声接続が有効な場合は勝手に停止せず明示停止後にだけ再開できる", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
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
