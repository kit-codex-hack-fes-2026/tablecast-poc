import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceConnection, type VoiceView } from "./voice-connection";
import { apiFetch } from "../../lib/api-fetch";

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
  addTrack = vi.fn<(track: unknown, stream: unknown) => void>();
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
const track = { kind: "audio", stop: vi.fn<() => void>() };
class VoiceMediaStream {
  getTracks = () => [track];
  getAudioTracks = () => [track];
}
const ignoreResolution = () => undefined;
function deferred<T>() {
  let resolve: (value: T) => void = ignoreResolution;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

let requests: { path: string; body: unknown; signal: AbortSignal | null | undefined }[];
let connections: VoiceConnection[];
const capture = vi.fn<() => Promise<VoiceMediaStream>>();
function connection() {
  const changes: VoiceView[] = [];
  const value = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
  connections.push(value);
  return { value, changes };
}
function peer() {
  const value = VoicePeer.instances.at(-1);
  if (!value) throw new Error("音声接続がまだ作成されていない");
  return value;
}
function caption(
  role: "user" | "assistant",
  text: string,
  start: number,
  end: number,
  eventId: string = crypto.randomUUID(),
) {
  peer().channel.receive({
    type: role === "user" ? "session.input_transcript.delta" : "session.output_transcript.delta",
    event_id: eventId,
    delta: text,
    start_ms: start,
    end_ms: end,
  });
}
function delegate(id = "item_tablecast_delegation") {
  peer().channel.receive({
    type: "session.delegation.created",
    delegation: { id, target: "client" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requests = [];
  connections = [];
  VoicePeer.instances = [];
  VoiceAudio.instances = [];
  vi.stubGlobal("RTCPeerConnection", VoicePeer);
  vi.stubGlobal("Audio", VoiceAudio);
  vi.stubGlobal("MediaStream", VoiceMediaStream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: capture } });
  capture.mockResolvedValue(new VoiceMediaStream());
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
    if (path.endsWith("/delegations")) return new Response("確認できました。");
    if (path.endsWith("/stop") || path.endsWith("/conversation"))
      return Response.json({ ok: true });
    return Response.json({ error: { code: "UNEXPECTED_TEST_REQUEST" } }, { status: 500 });
  });
});
afterEach(async () => {
  for (const value of connections) await value.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  const unexpected = requests.filter(
    ({ path }) =>
      !["/start", "/stop", "/conversation", "/delegations"].some((ending) => path.endsWith(ending)),
  );
  if (unexpected.length)
    throw new Error(`未定義の要求: ${unexpected.map(({ path }) => path).join(", ")}`);
});

describe("GPT-Live音声の明示的な停止と再開", () => {
  it("マイク許可待ちに停止した場合は遅れて取得したトラックを送信せず終了する", async () => {
    const pending = deferred<VoiceMediaStream>();
    capture.mockReturnValue(pending.promise);
    const { value, changes } = connection();
    const starting = value.start("ja");
    await value.stop();
    pending.resolve(new VoiceMediaStream());
    await starting;
    expect(peer().addTrack).not.toHaveBeenCalled();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(requests).toEqual([]);
    expect(changes.at(-1)?.status).toBe("paused");
  });
  it("停止はcaptureと出力を終了し明示再開だけが新しいsessionを発行する", async () => {
    const { value, changes } = connection();
    await value.start("ja");
    expect(peer().setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: "tablecast-answer",
    });
    await value.stop();
    expect(track.stop).toHaveBeenCalledOnce();
    expect(VoiceAudio.instances[0]?.pause).toHaveBeenCalledOnce();
    expect(peer().connectionState).toBe("closed");
    expect(peer().channel.send).toHaveBeenCalledWith(JSON.stringify({ type: "session.close" }));
    expect(changes.at(-1)?.status).toBe("paused");
    await value.start("en");
    expect(requests.filter(({ path }) => path.endsWith("/start")).map(({ body }) => body)).toEqual([
      { sdp: "tablecast-offer" },
      { sdp: "tablecast-offer" },
    ]);
    expect(changes.at(-1)?.status).toBe("listening");
  });
  it("開始連打で接続を増やさず接続失敗後も自動再接続しない", async () => {
    const { value, changes } = connection();
    await Promise.all([value.start("ja"), value.start("ja")]);
    expect(VoicePeer.instances).toHaveLength(1);
    peer().connectionState = "failed";
    peer().dispatchEvent(new Event("connectionstatechange"));
    await vi.waitFor(() => expect(changes.at(-1)?.status).toBe("error"));
    expect(requests.filter(({ path }) => path.endsWith("/start"))).toHaveLength(1);
    expect(track.stop).toHaveBeenCalledOnce();
  });
  it("別の音声sessionが有効ならそのsessionを停止せず自身のマイクを解放する", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(
      Response.json({ error: { code: "VOICE_ALREADY_ACTIVE" } }, { status: 409 }),
    );
    const { value, changes } = connection();
    await value.start("ja");
    expect(changes.at(-1)).toMatchObject({ status: "error", error: "active" });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(requests.filter(({ path }) => path.endsWith("/stop"))).toEqual([]);
    await value.stop({ existingSession: true });
    expect(requests.filter(({ path }) => path.endsWith("/stop"))).toHaveLength(1);
  });
  it("マイク拒否は音声だけをエラーにしproviderへ開始要求を送らない", async () => {
    capture.mockRejectedValueOnce(new DOMException("マイクが許可されていない", "NotAllowedError"));
    const { value, changes } = connection();
    await value.start("ja");
    expect(changes.at(-1)).toMatchObject({ status: "error", error: "permission" });
    expect(requests).toEqual([]);
    expect(peer().connectionState).toBe("closed");
  });
  it("設定不足では取得したマイクを解放しGUI用の音声エラーを返す", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(
      Response.json({ error: { code: "VOICE_NOT_CONFIGURED" } }, { status: 503 }),
    );
    const { value, changes } = connection();
    await value.start("ja");
    expect(changes.at(-1)).toMatchObject({ status: "error", error: "unconfigured" });
    expect(track.stop).toHaveBeenCalledOnce();
    expect(peer().connectionState).toBe("closed");
  });
  it("開始HTTPの待機中に停止した場合は要求を取り消し再接続しない", async () => {
    const original = vi.mocked(apiFetch).getMockImplementation();
    if (!original) throw new Error("HTTP fixtureがない");
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      const path = input instanceof Request ? input.url : String(input);
      if (!path.endsWith("/start")) return original(input, options);
      await original(input, options);
      return new Promise<Response>((_resolve, reject) =>
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("停止", "AbortError")),
        ),
      );
    });
    const { value, changes } = connection();
    const starting = value.start("ja");
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await value.stop();
    await starting;
    expect(requests[0]?.signal?.aborted).toBe(true);
    expect(changes.at(-1)?.status).toBe("paused");
    expect(peer().connectionState).toBe("closed");
  });
  it("サーバーの停止通知は端末captureも終了し別sessionへ停止要求を送らない", async () => {
    const { value, changes } = connection();
    await value.start("ja");
    value.synchronise("live_other", true, 1);
    await vi.waitFor(() => expect(changes.at(-1)?.status).toBe("paused"));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(requests.filter(({ path }) => path.endsWith("/stop"))).toEqual([]);
  });
  it("話速は変更時だけ接続へ伝え停止中の変更で音声を再開しない", async () => {
    const { value, changes } = connection();
    await value.start("ja", 0.8);
    value.synchronise("live_tablecast_1", true, 0.8);
    expect(peer().channel.send).not.toHaveBeenCalled();
    value.synchronise("live_tablecast_1", true, 1.2);
    value.synchronise("live_tablecast_1", true, 1.2);
    expect(peer().channel.send).toHaveBeenCalledOnce();
    expect(peer().channel.send).toHaveBeenCalledWith(
      expect.stringContaining('"content":"話速の希望は1.2倍相当'),
    );
    await value.stop();
    const sent = peer().channel.send.mock.calls.length;
    value.synchronise(null, false, 0.9);
    expect(peer().channel.send).toHaveBeenCalledTimes(sent);
    expect(changes.at(-1)?.status).toBe("paused");
    expect(requests.filter(({ path }) => path.endsWith("/start"))).toHaveLength(1);
  });
});

describe("逐次字幕とAgents APIへの委任", () => {
  it("許可された無言時の接客がAPIでスキップされても会話を終了しない", async () => {
    vi.useFakeTimers();
    const original = vi.mocked(apiFetch).getMockImplementation();
    if (!original) throw new Error("HTTP fixtureがない");
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      const result = await original(input, options);
      const path = input instanceof Request ? input.url : String(input);
      if (path.endsWith("/start"))
        return Response.json({
          voiceSessionId: "live_tablecast_proactive",
          sdp: "tablecast-answer",
          proactive: true,
        });
      if (path.endsWith("/delegations")) return new Response(null, { status: 204 });
      return result;
    });
    const { value, changes } = connection();
    await value.start("ja");
    await vi.advanceTimersByTimeAsync(179000);
    caption("user", "こんにちは", 100, 500);
    await vi.advanceTimersByTimeAsync(179000);
    expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(requests.find(({ path }) => path.endsWith("/delegations"))?.body).toMatchObject({
      delegationId: null,
      trigger: "proactive",
    });
    expect(changes.at(-1)?.status).toBe("listening");
    expect(track.stop).not.toHaveBeenCalled();
  });
  it("字幕を到着時に表示し話者が重なっても行のIDと順序を維持する", async () => {
    const { value, changes } = connection();
    await value.start("en");
    caption("assistant", "Here are", 100, 500);
    const first = changes.at(-1)?.messages?.[0];
    expect(first).toMatchObject({ text: "Here are", final: false, locale: "en" });
    caption("user", "Tea", 450, 600);
    caption("assistant", " your choices.", 500, 1000);
    expect(changes.at(-1)?.messages).toMatchObject([
      { id: first?.id, text: "Here are your choices." },
      { role: "user", text: "Tea" },
    ]);
    expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toEqual([]);
    await value.stop();
    const saved = requests.find(({ path }) => path.endsWith("/conversation"));
    expect(saved?.body).toMatchObject({
      items: [
        { itemId: first?.id, role: "assistant", text: "Here are your choices.", interrupted: true },
        { role: "user", text: "Tea", interrupted: false },
      ],
    });
    caption("assistant", "遅延した字幕", 1100, 1200);
    expect(changes.at(-1)?.messages?.[0]?.text).toBe("Here are your choices.");
    expect(changes.at(-1)?.status).toBe("paused");
  });
  it("遅れて届く断片を元の字幕へ戻し重複イベントを二重表示しない", async () => {
    const { value, changes } = connection();
    await value.start("ja");
    caption("user", "茶", 500, 700, "event_second");
    const id = changes.at(-1)?.messages?.[0]?.id;
    caption("user", "烏龍", 100, 500, "event_first");
    caption("user", "茶", 500, 700, "event_second");
    expect(changes.at(-1)?.messages).toMatchObject([{ id, text: "烏龍茶" }]);
  });
  it("表示上の字幕確定は委任を始めず後続字幕を同じIDで再保存する", async () => {
    vi.useFakeTimers();
    const { value, changes } = connection();
    await value.start("ja");
    caption("user", "烏龍茶", 100, 600);
    const id = changes.at(-1)?.messages?.[0]?.id;
    await vi.advanceTimersByTimeAsync(3000);
    expect(requests.filter(({ path }) => path.endsWith("/conversation"))).toHaveLength(1);
    caption("user", "を一つ", 600, 900);
    await vi.advanceTimersByTimeAsync(3000);
    expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toEqual([]);
    expect(
      requests.filter(({ path }) => path.endsWith("/conversation")).at(-1)?.body,
    ).toMatchObject({ items: [{ itemId: id, text: "烏龍茶を一つ" }] });
  });
  it("字幕の保存待ちで停止しても再開したsessionの字幕を引き続き保存する", async () => {
    vi.useFakeTimers();
    const { value } = connection();
    await value.start("ja");
    caption("user", "こんにちは", 100, 500);
    await vi.advanceTimersByTimeAsync(1500);
    await value.stop();
    await value.start("en");
    caption("user", "Hello", 100, 500);
    await vi.advanceTimersByTimeAsync(3000);
    expect(
      requests.filter(({ path }) => path.endsWith("/conversation")).map(({ body }) => body),
    ).toMatchObject([
      { voiceSessionId: "live_tablecast_1", items: [{ text: "こんにちは" }] },
      { voiceSessionId: "live_tablecast_2", items: [{ text: "Hello" }] },
    ]);
  });
  it("委任結果を全文完了より前に返し字幕や同じ委任通知で作業を重複させない", async () => {
    let output: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        output = controller;
      },
    });
    const original = vi.mocked(apiFetch).getMockImplementation();
    if (!original) throw new Error("HTTP fixtureがない");
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      const result = await original(input, options);
      if (!(input instanceof Request ? input.url : String(input)).endsWith("/delegations"))
        return result;
      options?.signal?.addEventListener("abort", () =>
        output?.error(new DOMException("停止", "AbortError")),
      );
      return new Response(stream);
    });
    const { value, changes } = connection();
    await value.start("ja");
    caption("user", "烏龍茶を一つ", 100, 700);
    caption("assistant", "確認します。", 750, 1200);
    delegate();
    await vi.waitFor(() =>
      expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(1),
    );
    expect(requests.find(({ path }) => path.endsWith("/delegations"))?.body).toMatchObject({
      messages: [{ role: "user", content: "烏龍茶を一つ" }],
    });
    output?.enqueue(new TextEncoder().encode("追加できました。"));
    await vi.waitFor(() =>
      expect(peer().channel.send).toHaveBeenCalledWith(
        expect.stringContaining('"content":"追加できました。"'),
      ),
    );
    delegate();
    caption("user", "ありがとう", 5000, 5500);
    expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(1);
    expect(requests.find(({ path }) => path.endsWith("/delegations"))?.signal?.aborted).toBe(false);
    expect(changes.at(-1)?.messages?.some((message) => message.text === "追加できました。")).toBe(
      false,
    );
    await value.stop();
    expect(requests.find(({ path }) => path.endsWith("/delegations"))?.signal?.aborted).toBe(true);
  });
  it("新しい委任通知では古い要求を取り消し同じIDへ結果を戻さない", async () => {
    const original = vi.mocked(apiFetch).getMockImplementation();
    if (!original) throw new Error("HTTP fixtureがない");
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      const result = await original(input, options);
      if (!(input instanceof Request ? input.url : String(input)).endsWith("/delegations"))
        return result;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            options?.signal?.addEventListener("abort", () =>
              controller.error(new DOMException("停止", "AbortError")),
            );
          },
        }),
      );
    });
    const { value } = connection();
    await value.start("ja");
    caption("user", "お茶", 100, 300);
    delegate("item_first");
    await vi.waitFor(() =>
      expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(1),
    );
    delegate("item_second");
    await vi.waitFor(() =>
      expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(2),
    );
    expect(requests.filter(({ path }) => path.endsWith("/delegations"))[0]?.signal?.aborted).toBe(
      true,
    );
    expect(peer().channel.send).not.toHaveBeenCalled();
  });
});
