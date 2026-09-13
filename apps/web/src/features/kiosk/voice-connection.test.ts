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
    if (path.endsWith("/delegations"))
      return new Response(
        'event: delta\ndata: {"delta":"確認できました。"}\n\nevent: completed\ndata: {}\n\n',
        { headers: { "content-type": "text/event-stream" } },
      );
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
  it("完結した文を逐次返し字幕や同じ委任通知で作業を重複させない", async () => {
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
    await value.start("en");
    caption("user", "What teas are available?", 100, 700);
    caption("assistant", "Let me check.", 750, 1200);
    delegate();
    await vi.waitFor(() =>
      expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(1),
    );
    expect(requests.find(({ path }) => path.endsWith("/delegations"))?.body).toMatchObject({
      messages: [{ role: "user", content: "What teas are available?" }],
    });
    for (const delta of [
      "We",
      " have two teas available, both 340 yen:",
      " Oolong tea, or Japanese green tea.",
    ])
      output?.enqueue(
        new TextEncoder().encode(`event: delta\ndata: ${JSON.stringify({ delta })}\n\n`),
      );
    await vi.waitFor(() => expect(peer().channel.send).toHaveBeenCalledOnce());
    expect(JSON.parse(peer().channel.send.mock.calls[0]?.[0] ?? "null")).toMatchObject({
      type: "session.commentary.append",
      delegation_id: "item_tablecast_delegation",
      content: "We have two teas available, both 340 yen: Oolong tea, or Japanese green tea.",
    });
    for (const delta of [" Both can be served at your", " chosen temperature. Thank you"])
      output?.enqueue(
        new TextEncoder().encode(`event: delta\ndata: ${JSON.stringify({ delta })}\n\n`),
      );
    await vi.waitFor(() => expect(peer().channel.send).toHaveBeenCalledTimes(2));
    expect(JSON.parse(peer().channel.send.mock.calls[1]?.[0] ?? "null")).toMatchObject({
      delegation_id: "item_tablecast_delegation",
      content: " Both can be served at your chosen temperature. ",
    });
    delegate();
    caption("user", "Thanks", 5000, 5500);
    expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(1);
    expect(requests.find(({ path }) => path.endsWith("/delegations"))?.signal?.aborted).toBe(false);
    expect(changes.at(-1)?.messages?.some((message) => message.text.startsWith("We have"))).toBe(
      false,
    );
    output?.enqueue(new TextEncoder().encode("event: completed\ndata: {}\n\n"));
    await vi.waitFor(() => expect(peer().channel.send).toHaveBeenCalledTimes(3));
    expect(JSON.parse(peer().channel.send.mock.calls[2]?.[0] ?? "null")).toMatchObject({
      delegation_id: "item_tablecast_delegation",
      content: "Thank you",
    });
    await vi.waitFor(() => expect(changes.at(-1)?.status).toBe("listening"));
    await value.stop();
  });
  it.each(["ja", "en"] as const)(
    "%sの明示された照会失敗は未完結文を破棄し、同じ音声接続で次の委任を受け付ける",
    async (locale) => {
      const original = vi.mocked(apiFetch).getMockImplementation();
      if (!original) throw new Error("HTTP fixtureがない");
      let failed = false;
      vi.mocked(apiFetch).mockImplementation(async (input, options) => {
        const result = await original(input, options);
        if (
          failed ||
          !(input instanceof Request ? input.url : String(input)).endsWith("/delegations")
        )
          return result;
        failed = true;
        return new Response(
          'event: delta\ndata: {"delta":"注文を確定"}\n\nevent: failed\ndata: {"code":"VOICE_MODEL_FAILED"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        );
      });
      const { value, changes } = connection();
      await value.start(locale);
      caption("user", locale === "ja" ? "お茶を一つ" : "One tea, please", 100, 700);
      delegate();
      await vi.waitFor(() => expect(peer().channel.send).toHaveBeenCalledOnce());
      expect(JSON.parse(peer().channel.send.mock.calls[0]?.[0] ?? "null")).toMatchObject({
        type: "session.commentary.append",
        delegation_id: "item_tablecast_delegation",
        content:
          locale === "ja"
            ? "申し訳ありません。今回のご案内や操作を完了できませんでした。ご注文の状態は画面でご確認ください。"
            : "Sorry, I couldn't complete that request. Please check your order on the screen.",
      });
      await vi.waitFor(() => expect(changes.at(-1)?.status).toBe("listening"));
      expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(1);
      expect(requests.filter(({ path }) => path.endsWith("/stop"))).toEqual([]);
      expect(track.stop).not.toHaveBeenCalled();
      expect(peer().connectionState).toBe("connected");
      caption("user", locale === "ja" ? "メニューを見せて" : "Show me the menu", 8000, 8500);
      delegate("item_next");
      await vi.waitFor(() => expect(peer().channel.send).toHaveBeenCalledTimes(2));
      expect(JSON.parse(peer().channel.send.mock.calls[1]?.[0] ?? "null")).toMatchObject({
        type: "session.commentary.append",
        delegation_id: "item_next",
        content: "確認できました。",
      });
      await vi.waitFor(() => expect(changes.at(-1)?.status).toBe("listening"));
      expect(VoicePeer.instances).toHaveLength(1);
      expect(capture).toHaveBeenCalledOnce();
      expect(requests.filter(({ path }) => path.endsWith("/start"))).toHaveLength(1);
      expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(2);
    },
  );
  it("取消済みの委任では途中の本文や失敗説明を発話しない", async () => {
    const original = vi.mocked(apiFetch).getMockImplementation();
    if (!original) throw new Error("HTTP fixtureがない");
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      const result = await original(input, options);
      if (!(input instanceof Request ? input.url : String(input)).endsWith("/delegations"))
        return result;
      return new Response(
        'event: delta\ndata: {"delta":"注文を確定"}\n\nevent: failed\ndata: {"code":"VOICE_CANCELLED"}\n\n',
      );
    });
    const { value, changes } = connection();
    await value.start("ja");
    caption("user", "お茶", 100, 700);
    delegate();
    await vi.waitFor(() => expect(changes.at(-1)?.status).toBe("listening"));
    expect(peer().channel.send).not.toHaveBeenCalled();
    expect(track.stop).not.toHaveBeenCalled();
    expect(peer().connectionState).toBe("connected");
  });
  it.each(["停止", "新しい委任"])("%sの後に届く古い失敗説明を混ぜない", async (action) => {
    const original = vi.mocked(apiFetch).getMockImplementation();
    if (!original) throw new Error("HTTP fixtureがない");
    const pending = deferred<Response>();
    let first = true;
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      const result = await original(input, options);
      if (
        !first ||
        !(input instanceof Request ? input.url : String(input)).endsWith("/delegations")
      )
        return result;
      first = false;
      return pending.promise;
    });
    const { value, changes } = connection();
    await value.start("ja");
    caption("user", "お茶", 100, 700);
    delegate("item_old");
    await vi.waitFor(() =>
      expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(1),
    );
    if (action === "停止") await value.stop();
    else delegate("item_new");
    const released = vi.fn<() => void>();
    pending.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('event: failed\ndata: {"code":"VOICE_MODEL_FAILED"}\n\n'),
            );
          },
          cancel: released,
        }),
      ),
    );
    await vi.waitFor(() => expect(released).toHaveBeenCalledOnce());
    const commentary = peer().channel.send.mock.calls.flatMap(([data]) => {
      const event: unknown = JSON.parse(data);
      return event &&
        typeof event === "object" &&
        "type" in event &&
        event.type === "session.commentary.append"
        ? [event]
        : [];
    });
    expect(commentary).toMatchObject(
      action === "停止" ? [] : [{ delegation_id: "item_new", content: "確認できました。" }],
    );
    expect(changes.at(-1)?.status).toBe(action === "停止" ? "paused" : "listening");
    expect(VoicePeer.instances).toHaveLength(1);
  });
  it.each([
    ["不正な失敗通知", 'event: failed\ndata: {"code":"unknown"}\n\n'],
    ["壊れたSSE本文", "event: failed\ndata: {\n\n"],
    ["完了前の切断", ""],
    [
      "未完結文の上限超過",
      ["あ".repeat(8000), "い".repeat(8000)]
        .map((delta) => `event: delta\ndata: ${JSON.stringify({ delta })}\n\n`)
        .join(""),
    ],
  ])("業務の%sで音声を停止し、自動再接続しない", async (_name, terminal) => {
    const original = vi.mocked(apiFetch).getMockImplementation();
    if (!original) throw new Error("HTTP fixtureがない");
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      const result = await original(input, options);
      if (!(input instanceof Request ? input.url : String(input)).endsWith("/delegations"))
        return result;
      return new Response('event: delta\ndata: {"delta":"注文を確定"}\n\n' + terminal, {
        headers: { "content-type": "text/event-stream" },
      });
    });
    const { value, changes } = connection();
    await value.start("ja");
    caption("user", "烏龍茶を一つ", 100, 700);
    delegate();
    await vi.waitFor(() => expect(changes.at(-1)).toMatchObject({ status: "error" }));
    expect(track.stop).toHaveBeenCalledOnce();
    expect(peer().connectionState).toBe("closed");
    expect(
      peer().channel.send.mock.calls.some(([data]) => data.includes("commentary.append")),
    ).toBe(false);
    expect(requests.filter(({ path }) => path.endsWith("/stop"))).toHaveLength(1);
    peer().channel.receive({ type: "session.started" });
    delegate("item_late");
    expect(requests.filter(({ path }) => path.endsWith("/start"))).toHaveLength(1);
    expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(1);
  });
  it("業務の完了通知を受けた後も次の会話を受け付ける", async () => {
    const { value, changes } = connection();
    await value.start("ja");
    caption("user", "お茶はありますか", 100, 700);
    delegate();
    await vi.waitFor(() =>
      expect(peer().channel.send).toHaveBeenCalledWith(
        expect.stringContaining('"content":"確認できました。"'),
      ),
    );
    await vi.waitFor(() => expect(changes.at(-1)?.status).toBe("listening"));
    expect(track.stop).not.toHaveBeenCalled();
    expect(peer().connectionState).toBe("connected");
    caption("user", "ありがとう", 8000, 8500);
    expect(changes.at(-1)?.messages?.at(-1)?.text).toBe("ありがとう");
  });
  it.each(["停止", "新しい委任"])("%sでは未完結の結果を破棄する", async (interruption) => {
    const original = vi.mocked(apiFetch).getMockImplementation();
    if (!original) throw new Error("HTTP fixtureがない");
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      const result = await original(input, options);
      if (!(input instanceof Request ? input.url : String(input)).endsWith("/delegations"))
        return result;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'event: delta\ndata: {"delta":"お茶があります。注文を確定"}\n\n',
              ),
            );
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
    await vi.waitFor(() => expect(peer().channel.send).toHaveBeenCalledOnce());
    if (interruption === "停止") await value.stop();
    else delegate("item_second");
    await vi.waitFor(() => expect(peer().channel.send).toHaveBeenCalledTimes(2));
    expect(requests.filter(({ path }) => path.endsWith("/delegations"))[0]?.signal?.aborted).toBe(
      true,
    );
    const commentary = peer()
      .channel.send.mock.calls.map(([data]) => data)
      .filter((data) => data.includes('"type":"session.commentary.append"'));
    const expectedDelegations =
      interruption === "停止" ? ["item_first"] : ["item_first", "item_second"];
    expect(commentary).toHaveLength(expectedDelegations.length);
    for (const [index, delegation_id] of expectedDelegations.entries())
      expect(JSON.parse(commentary[index] ?? "null")).toMatchObject({
        type: "session.commentary.append",
        delegation_id,
        content: "お茶があります。",
      });
  });
});
