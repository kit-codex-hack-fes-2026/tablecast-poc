import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiFetch } from "../../lib/api-fetch";
import { deferred, peer, voiceFixture } from "./test-support/voice-transport-fixture";
import { VoiceConnection, type VoiceView } from "./voice-connection";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
let fixture: ReturnType<typeof voiceFixture>;
const suggestions = ["お茶の種類を教えてください", "料理のおすすめは？", "今は大丈夫です"];
let reply: Promise<Response> | undefined;
beforeEach(() => {
  fixture = voiceFixture();
  reply = undefined;
  const original = vi.mocked(apiFetch).getMockImplementation();
  vi.mocked(apiFetch).mockImplementation(async (input, options) => {
    const path = input instanceof Request ? input.url : String(input);
    if (path.endsWith("/suggestions")) {
      const body = z
        .object({ locale: z.string(), itemId: z.string(), text: z.string() })
        .parse(JSON.parse(z.string().parse(options?.body)));
      return reply ?? Response.json({ ...body, suggestions });
    }
    if (!original) throw new Error("HTTP fixtureが必要です");
    const result = await original(input, options);
    if (path.endsWith("/start")) {
      const start: unknown = await result.json();
      return Response.json({
        ...z
          .object({ voiceSessionId: z.string(), sdp: z.string(), proactive: z.boolean() })
          .parse(start),
        guidance: true,
        opening: "歓迎して一問で案内してください。",
      });
    }
    return result;
  });
});
afterEach(async () => fixture.dispose());
function connection() {
  const changes: VoiceView[] = [];
  const value = new VoiceConnection(
    (view) => changes.push(view),
    () => {},
  );
  fixture.connections.push(value);
  return { value, changes };
}
const caption = (role: "assistant" | "user", delta: string) =>
  peer().channel.receive({
    type:
      role === "assistant" ? "session.output_transcript.delta" : "session.input_transcript.delta",
    event_id: crypto.randomUUID(),
    delta,
    start_ms: 0,
    end_ms: 400,
  });

const receive = (delegation_id: null | string, event: unknown, client_event_id?: string) =>
  peer().channel.receive({ type: "response.event", delegation_id, event, client_event_id });

it("同じ接続の開始案内は一回だけ送信する", async () => {
  const { value } = connection();
  await value.start("ja");
  peer().channel.receive({ type: "session.started" });
  expect(
    peer().channel.send.mock.calls.filter(([data]) => data.includes("session.commentary.append")),
  ).toHaveLength(1);
});

it("候補をタップすると選んだ文だけを一度送信し、APIに新しい利用客turnを登録する", async () => {
  vi.useFakeTimers();
  const { value, changes } = connection();
  await value.start("ja");
  caption("assistant", "お茶はいかがですか？");
  await vi.advanceTimersByTimeAsync(1500);
  const source = changes.at(-1)?.suggestions;
  expect(source).toEqual(suggestions);
  await value.sendSuggestion(suggestions[0] ?? "", source);
  await value.sendSuggestion(suggestions[0] ?? "", source);
  const inputs = peer().channel.send.mock.calls.map(([data]): unknown => JSON.parse(data));
  expect(
    inputs.filter(
      (event) => z.object({ type: z.string() }).parse(event).type === "response.item.create",
    ),
  ).toHaveLength(1);
  expect(fixture.requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(1);
  expect(changes.at(-1)?.messages?.at(-1)).toMatchObject({ role: "user", text: suggestions[0] });
  expect(changes.at(-1)?.suggestions).toEqual([]);
});

it("候補生成中の発話・言語切替では遅着した候補を表示しない", async () => {
  vi.useFakeTimers();
  const pending = deferred<Response>();
  reply = pending.promise;
  const { value, changes } = connection();
  await value.start("ja");
  caption("assistant", "お茶はいかがですか？");
  await vi.advanceTimersByTimeAsync(1500);
  value.synchronise("live_tablecast_1", true, 1, "en");
  caption("user", "No, thank you.");
  pending.resolve(
    Response.json({ locale: "ja", itemId: "old", text: "お茶はいかがですか？", suggestions }),
  );
  await vi.advanceTimersByTimeAsync(10);
  expect(changes.at(-1)?.suggestions).toEqual([]);
  expect(changes.at(-1)?.status).not.toBe("error");
});

it("候補の返答はclient_event_idで対応付け、前の委任の遅着toolを新しい発言へ流用しない", async () => {
  vi.useFakeTimers();
  const { value } = connection();
  await value.start("ja");
  peer().channel.receive({
    type: "session.delegation.created",
    delegation: { id: "tablecast-previous", target: "responses" },
  });
  receive("tablecast-previous", {
    type: "response.created",
    response: { id: "tablecast-previous-response" },
  });
  receive("tablecast-previous", {
    type: "response.completed",
    response: { id: "tablecast-previous-response" },
  });
  await vi.advanceTimersByTimeAsync(100);
  caption("assistant", "お茶はいかがですか？");
  await vi.advanceTimersByTimeAsync(1500);
  const source = value.getSnapshot().suggestions;
  await value.sendSuggestion(suggestions[0] ?? "", source);
  const command = peer()
    .channel.send.mock.calls.map(([data]) =>
      z.object({ type: z.string(), event_id: z.string().optional() }).parse(JSON.parse(data)),
    )
    .findLast((event) => event.type === "response.create");
  expect(command?.event_id).toBeDefined();
  receive("tablecast-previous", {
    type: "response.created",
    response: { id: "tablecast-stale-response" },
  });
  receive("tablecast-previous", {
    type: "response.output_item.done",
    item: {
      type: "function_call",
      call_id: "tablecast-stale-staff",
      name: "callStaff",
      arguments: "{}",
    },
  });
  receive("tablecast-previous", {
    type: "response.completed",
    response: { id: "tablecast-stale-response" },
  });
  receive(
    null,
    { type: "response.created", response: { id: "tablecast-selected-response" } },
    command?.event_id,
  );
  receive(null, {
    type: "response.output_item.done",
    response_id: "tablecast-selected-response",
    item: {
      type: "function_call",
      call_id: "tablecast-selected-state",
      name: "getTableState",
      arguments: "{}",
    },
  });
  receive(null, { type: "response.completed", response: { id: "tablecast-selected-response" } });
  await vi.advanceTimersByTimeAsync(100);
  expect(
    fixture.requests.filter(({ path }) => path.endsWith("/tools")).map(({ body }) => body),
  ).toMatchObject([{ toolName: "getTableState", toolCallId: "tablecast-selected-state" }]);
});
