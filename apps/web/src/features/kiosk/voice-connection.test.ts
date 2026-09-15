import { z } from "zod";
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
const track = {
  kind: "audio",
  label: "Built-in",
  addEventListener: vi.fn<() => void>(),
  stop: vi.fn<() => void>(),
};
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
function sentEvent(data: string) {
  return z
    .object({
      type: z.string(),
      item: z.object({ call_id: z.string(), output: z.string() }).optional(),
    })
    .parse(JSON.parse(data));
}
function delegate(id = "item_tablecast_delegation") {
  peer().channel.receive({
    type: "session.delegation.created",
    delegation: { id, target: "responses" },
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
    if (path.endsWith("/opening")) return new Response(null, { status: 204 });
    if (path.endsWith("/suggestions")) return Response.json({ suggestions: [] });
    if (path.endsWith("/delegations"))
      return Response.json({ kind: "accepted", turnId: "tablecast-turn" });
    if (path.endsWith("/tools")) return Response.json({ result: { products: [] } });
    if (path.endsWith("/finish")) return Response.json({ ok: true });
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
      ![
        "/start",
        "/stop",
        "/conversation",
        "/delegations",
        "/tools",
        "/finish",
        "/opening",
        "/suggestions",
      ].some((ending) => path.endsWith(ending)),
  );
  if (unexpected.length)
    throw new Error(`未定義の要求: ${unexpected.map(({ path }) => path).join(", ")}`);
});

describe("開始案内と発話ヒント", () => {
  it("接続完了の重複イベントでも開始案内を一度だけ送り、客発話を作らない", async () => {
    const fallback = vi.mocked(apiFetch).getMockImplementation();
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      if ((input instanceof Request ? input.url : input.toString()).endsWith("/opening"))
        return Response.json({ text: "いらっしゃいませ。", locale: "ja", mode: "welcome" });
      if (!fallback) throw new Error("API fixtureが必要です");
      return fallback(input, options);
    });
    const { value } = connection();
    await value.start("ja");
    peer().channel.receive({ type: "session.started" });
    await vi.waitFor(() =>
      expect(
        peer().channel.send.mock.calls.filter(
          ([data]) => sentEvent(data).type === "session.commentary.append",
        ),
      ).toHaveLength(1),
    );
    expect(
      peer().channel.send.mock.calls.some(
        ([data]) => sentEvent(data).type === "response.item.create",
      ),
    ).toBe(false);
    expect(requests.some(({ path }) => path.endsWith("/conversation"))).toBe(false);
  });

  it.each(["停止", "客発話", "委任", "言語変更"])(
    "開始案内の生成中の%sで古い案内を破棄する",
    async (operation) => {
      const pending = deferred<Response>();
      const fallback = vi.mocked(apiFetch).getMockImplementation();
      vi.mocked(apiFetch).mockImplementation(async (input, options) => {
        if ((input instanceof Request ? input.url : input.toString()).endsWith("/opening"))
          return pending.promise;
        if (!fallback) throw new Error("API fixtureが必要です");
        return fallback(input, options);
      });
      const { value } = connection();
      await value.start("ja");
      const oldPeer = peer();
      if (operation === "客発話") caption("user", "おすすめを教えて", 100, 500);
      else if (operation === "委任") delegate();
      else await value.stop();
      if (operation === "言語変更") await value.start("en");
      pending.resolve(Response.json({ text: "古い開始案内", locale: "ja", mode: "welcome" }));
      await vi.waitFor(() =>
        expect(
          vi.mocked(apiFetch).mock.settledResults.every((result) => result.type !== "incomplete"),
        ).toBe(true),
      );
      expect(oldPeer.channel.send.mock.calls.some(([data]) => data.includes("古い開始案内"))).toBe(
        false,
      );
      expect(peer().channel.send.mock.calls.some(([data]) => data.includes("古い開始案内"))).toBe(
        false,
      );
    },
  );

  it("最新AI字幕を保存してからヒントを取得し、次の発話で消す", async () => {
    vi.useFakeTimers();
    const fallback = vi.mocked(apiFetch).getMockImplementation();
    let suggestionInput: unknown;
    let savedBeforeSuggestion = false;
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      if ((input instanceof Request ? input.url : input.toString()).endsWith("/suggestions")) {
        suggestionInput = JSON.parse(z.string().parse(options?.body));
        const source = z.object({ itemId: z.string(), text: z.string() }).parse(suggestionInput);
        savedBeforeSuggestion = requests.some(({ path }) => path.endsWith("/conversation"));
        return Response.json({
          ...source,
          locale: "ja",
          suggestions: ["説明をお願いします", "あとでお願いします"],
        });
      }
      if (!fallback) throw new Error("API fixtureが必要です");
      return fallback(input, options);
    });
    const { value, changes } = connection();
    await value.start("ja");
    caption("assistant", "ご案内しましょうか？", 100, 800);
    await vi.advanceTimersByTimeAsync(1500);
    expect(savedBeforeSuggestion).toBe(true);
    expect(suggestionInput).toMatchObject({ text: "ご案内しましょうか？" });
    expect(changes.at(-1)?.suggestions).toEqual(["説明をお願いします", "あとでお願いします"]);
    caption("user", "あとで", 1000, 1300);
    expect(changes.at(-1)?.suggestions).toEqual([]);
  });

  it("客字幕が前の行へ追記されても古いAI字幕のタイマーからヒントを生成しない", async () => {
    vi.useFakeTimers();
    const { value, changes } = connection();
    await value.start("ja");
    caption("user", "注文の仕方", 0, 300);
    caption("assistant", "ご案内しましょうか？", 400, 700);
    await vi.advanceTimersByTimeAsync(500);
    caption("user", "は分かります", 800, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(requests.some(({ path }) => path.endsWith("/suggestions"))).toBe(false);
    expect(changes.at(-1)?.suggestions).toEqual([]);
  });

  it.each(["客発話", "新しいAI字幕", "停止"])(
    "候補の取得中の%sで遅着したヒントを破棄する",
    async (operation) => {
      vi.useFakeTimers();
      const pending = deferred<Response>();
      const fallback = vi.mocked(apiFetch).getMockImplementation();
      let suggestionInput: unknown;
      vi.mocked(apiFetch).mockImplementation(async (input, options) => {
        if ((input instanceof Request ? input.url : input.toString()).endsWith("/suggestions")) {
          suggestionInput = JSON.parse(z.string().parse(options?.body));
          return pending.promise;
        }
        if (!fallback) throw new Error("API fixtureが必要です");
        return fallback(input, options);
      });
      const { value, changes } = connection();
      await value.start("ja");
      caption("assistant", "ご案内しましょうか？", 100, 800);
      await vi.advanceTimersByTimeAsync(1500);
      const source = z.object({ itemId: z.string(), text: z.string() }).parse(suggestionInput);
      if (operation === "停止") await value.stop();
      else caption(operation === "客発話" ? "user" : "assistant", "次の話題", 2000, 2500);
      pending.resolve(Response.json({ ...source, locale: "ja", suggestions: ["古いヒント"] }));
      await vi.advanceTimersByTimeAsync(0);
      expect(changes.at(-1)?.suggestions).toEqual([]);
    },
  );

  it("開始案内の失敗でもマイクと会話接続を維持し、声で始める案内を表示する", async () => {
    const fallback = vi.mocked(apiFetch).getMockImplementation();
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      if ((input instanceof Request ? input.url : input.toString()).endsWith("/opening"))
        return Response.json({ error: { code: "VOICE_MODEL_FAILED" } }, { status: 503 });
      if (!fallback) throw new Error("API fixtureが必要です");
      return fallback(input, options);
    });
    const { value, changes } = connection();
    await value.start("ja");
    await vi.waitFor(() => expect(changes.at(-1)?.openingFailed).toBe(true));
    expect(changes.at(-1)?.status).toBe("listening");
    expect(track.stop).not.toHaveBeenCalled();
  });
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

describe("逐次字幕と標準Responsesへの委任", () => {
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
  it("Responsesの全tool結果を返してから一度だけ継続し、完了snapshotの空配列を無視する", async () => {
    const { value } = connection();
    await value.start("ja");
    delegate();
    const receive = (event: unknown) =>
      peer().channel.receive({
        type: "response.event",
        delegation_id: "item_tablecast_delegation",
        event,
      });
    receive({ type: "response.created", response: { id: "resp_tools" } });
    for (const [call_id, name] of [
      ["call_catalog", "getCatalog"],
      ["call_state", "getTableState"],
    ])
      receive({
        type: "response.output_item.done",
        item: { type: "function_call", call_id, name, arguments: "{}" },
      });
    receive({ type: "response.completed", response: { id: "resp_tools", output: [] } });
    receive({ type: "response.completed", response: { id: "resp_tools", output: [] } });
    await vi.waitFor(() =>
      expect(
        peer().channel.send.mock.calls.filter(
          ([data]) => sentEvent(data).type === "response.create",
        ),
      ).toHaveLength(1),
    );
    const sent = peer().channel.send.mock.calls.map(([data]) => sentEvent(data));
    expect(
      sent
        .filter((event) => event.type === "response.item.create")
        .map((event) => event.item?.call_id)
        .toSorted((a, b) => (a ?? "").localeCompare(b ?? "")),
    ).toEqual(["call_catalog", "call_state"]);
    expect(requests.filter(({ path }) => path.endsWith("/tools"))).toHaveLength(2);
    expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(1);
    receive({ type: "response.created", response: { id: "resp_answer" } });
    receive({ type: "response.completed", response: { id: "resp_answer", output: [] } });
    await vi.waitFor(() =>
      expect(requests.filter(({ path }) => path.endsWith("/finish"))).toHaveLength(1),
    );
  });
  it.each([
    ["tools", "CART_CONFLICT"],
    ["delegations", "VOICE_TURN_UNAVAILABLE"],
  ])("%s失敗を結果として返し音声接続を維持する", async (path, code) => {
    const original = vi.mocked(apiFetch).getMockImplementation();
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      if ((input instanceof Request ? input.url : String(input)).endsWith(`/${path}`))
        return Response.json(
          { error: { code: "CART_CONFLICT", message: "競合" } },
          { status: 409 },
        );
      if (!original) throw new Error("API fixtureがありません");
      return original(input, options);
    });
    const { value } = connection();
    await value.start("ja");
    delegate();
    const receive = (event: unknown) =>
      peer().channel.receive({
        type: "response.event",
        delegation_id: "item_tablecast_delegation",
        event,
      });
    receive({ type: "response.created", response: { id: "resp_error" } });
    receive({
      type: "response.output_item.done",
      response_id: "resp_error",
      item: { type: "function_call", call_id: "call_error", name: "getCatalog", arguments: "{}" },
    });
    receive({ type: "response.completed", response: { id: "resp_error" } });
    await vi.waitFor(() =>
      expect(
        peer().channel.send.mock.calls.some(([data]) => sentEvent(data).type === "response.create"),
      ).toBe(true),
    );
    const output = peer()
      .channel.send.mock.calls.map(([data]) => sentEvent(data))
      .find((event) => event.type === "response.item.create");
    expect(JSON.parse(output?.item?.output ?? "null")).toEqual({ error: code });
    expect(peer().close).not.toHaveBeenCalled();
  });
  it("新しい委任が始まった後に古いtool結果を継続しない", async () => {
    const pending = Promise.withResolvers<Response>();
    const original = vi.mocked(apiFetch).getMockImplementation();
    vi.mocked(apiFetch).mockImplementation(async (input, options) => {
      if ((input instanceof Request ? input.url : String(input)).endsWith("/tools"))
        return pending.promise;
      if (!original) throw new Error("API fixtureがありません");
      return original(input, options);
    });
    const { value } = connection();
    await value.start("ja");
    delegate();
    const receive = (event: unknown) =>
      peer().channel.receive({
        type: "response.event",
        delegation_id: "item_tablecast_delegation",
        event,
      });
    receive({ type: "response.created", response: { id: "resp_old" } });
    receive({
      type: "response.output_item.done",
      response_id: "resp_old",
      item: { type: "function_call", call_id: "call_old", name: "getCatalog", arguments: "{}" },
    });
    receive({ type: "response.completed", response: { id: "resp_old" } });
    await vi.waitFor(() =>
      expect(
        vi
          .mocked(apiFetch)
          .mock.calls.some(([input]) =>
            (input instanceof Request ? input.url : input.toString()).endsWith("/tools"),
          ),
      ).toBe(true),
    );
    delegate("item_new");
    pending.resolve(Response.json({ result: { products: [] } }));
    await vi.waitFor(() =>
      expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(2),
    );
    expect(
      peer().channel.send.mock.calls.some(([data]) => sentEvent(data).type === "response.create"),
    ).toBe(false);
  });
});
