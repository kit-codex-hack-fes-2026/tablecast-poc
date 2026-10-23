import { type DisplayCurrencyContext, displayCurrencyContextSchema } from "@tablecast/api/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiFetch } from "../../lib/api-fetch";
import {
  deferred,
  peer,
  track,
  VoiceAudio,
  voiceFixture,
  VoiceMediaStream,
  VoicePeer,
} from "./test-support/voice-transport-fixture";
import { VoiceConnection, type VoiceView } from "./voice-connection";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));

let fixture: ReturnType<typeof voiceFixture>;
let requests: ReturnType<typeof voiceFixture>["requests"];
let connections: ReturnType<typeof voiceFixture>["connections"];
let capture: ReturnType<typeof voiceFixture>["capture"];

function connection() {
  const changes: VoiceView[] = [];
  const value = new VoiceConnection((view) => changes.push(view), vi.fn<() => void>());
  connections.push(value);
  return { value, changes };
}

function caption(
  role: "assistant" | "user",
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
  fixture = voiceFixture();
  ({ requests, connections, capture } = fixture);
});
afterEach(async () => fixture.dispose());

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

const receive = (event: unknown) =>
  peer().channel.receive({
    type: "response.event",
    delegation_id: "item_tablecast_delegation",
    event,
  });

it("通貨変更を適用した後の設定を次のtoolへ送り、全通貨レートはモデルへ返さない", async () => {
  let context: DisplayCurrencyContext = {
    currency: "USD",
    revision: 0,
    rates: {
      base: "JPY",
      source: "currency-api",
      date: "2026-10-22",
      rates: { USD: 0.0065, AUD: 0.00967 },
    },
  };
  const setCurrency = vi.fn<
    (currency: DisplayCurrencyContext["currency"], revision?: number) => boolean
  >((currency) => {
    context = { ...context, currency, revision: context.revision + 1 };
    return true;
  });
  const value = new VoiceConnection(vi.fn<() => void>(), vi.fn<() => void>(), undefined, {
    getContext: () => context,
    setCurrency,
  });
  connections.push(value);
  const fallback = vi.mocked(apiFetch).getMockImplementation();
  if (!fallback) throw new Error("HTTP fixtureが必要です");
  const contexts: DisplayCurrencyContext[] = [];
  vi.mocked(apiFetch).mockImplementation(async (input, options) => {
    const path = input instanceof Request ? input.url : String(input);
    if (!path.endsWith("/tools")) return fallback(input, options);
    const body = z
      .object({ toolName: z.string(), displayCurrency: displayCurrencyContextSchema })
      .parse(JSON.parse(typeof options?.body === "string" ? options.body : "null"));
    contexts.push(body.displayCurrency);
    return Response.json(
      body.toolName === "setDisplayCurrency"
        ? {
            result: { displayCurrency: { currency: "AUD", status: "ready" } },
            displayCurrencyAction: { currency: "AUD", revision: 0 },
          }
        : {
            result: { products: [], displayCurrency: { currency: body.displayCurrency.currency } },
          },
    );
  });
  await value.start("ja");
  delegate();
  receive({ type: "response.created", response: { id: "resp_currency" } });
  for (const [call_id, name] of [
    ["call_currency", "setDisplayCurrency"],
    ["call_price", "getCatalog"],
  ])
    receive({
      type: "response.output_item.done",
      item: {
        type: "function_call",
        call_id,
        name,
        arguments: name === "setDisplayCurrency" ? '{"currency":"AUD"}' : "{}",
      },
    });
  receive({
    type: "response.completed",
    response: { id: "resp_currency", output: [] },
  });
  await vi.waitFor(() =>
    expect(
      peer().channel.send.mock.calls.filter(([data]) => sentEvent(data).type === "response.create"),
    ).toHaveLength(1),
  );
  expect(setCurrency).toHaveBeenCalledExactlyOnceWith("AUD", 0);
  expect(contexts.map((item) => item.currency)).toEqual(["USD", "AUD"]);
  const outputs = peer()
    .channel.send.mock.calls.map(([data]) => sentEvent(data))
    .filter((event) => event.type === "response.item.create")
    .map((event) => event.item?.output);
  expect(outputs).toHaveLength(2);
  expect(outputs.join(" ")).not.toContain("rates");
});
