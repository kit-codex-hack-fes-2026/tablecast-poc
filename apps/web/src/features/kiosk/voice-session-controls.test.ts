import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiFetch } from "../../lib/api-fetch";
import { peer, track, voiceFixture, VoicePeer } from "./test-support/voice-transport-fixture";
import { VoiceConnection, type VoiceView } from "./voice-connection";
vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
let fixture: ReturnType<typeof voiceFixture>;
let requests: ReturnType<typeof voiceFixture>["requests"];
beforeEach(() => {
  fixture = voiceFixture();
  requests = fixture.requests;
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
const delegate = (id = "tablecast-controls-delegation") =>
  peer().channel.receive({
    type: "session.delegation.created",
    delegation: { id, target: "responses" },
  });
const receive = (event: unknown) =>
  peer().channel.receive({
    type: "response.event",
    delegation_id: "tablecast-controls-delegation",
    event,
  });
const caption = (_role: string, delta: string, start_ms: number, end_ms: number) =>
  peer().channel.receive({
    type: "session.output_transcript.delta",
    event_id: crypto.randomUUID(),
    delta,
    start_ms,
    end_ms,
  });

it("接続中の言語変更はtransportを作り直さず、新しい字幕と委任へ言語を反映する", async () => {
  const { value, changes } = connection();
  await value.start("ja");
  value.synchronise("live_tablecast_1", true, 1, "en");
  caption("assistant", "How can I help?", 100, 500);
  delegate("tablecast-new-language");
  await vi.waitFor(() =>
    expect(requests.filter(({ path }) => path.endsWith("/delegations"))).toHaveLength(1),
  );
  expect(requests.find(({ path }) => path.endsWith("/delegations"))?.body).toMatchObject({
    locale: "en",
  });
  expect(changes.at(-1)?.messages?.at(-1)?.locale).toBe("en");
  expect(VoicePeer.instances).toHaveLength(1);
  expect(track.stop).not.toHaveBeenCalled();
  expect(requests.filter(({ path }) => path.endsWith("/stop"))).toHaveLength(0);
});

it("終了toolの後は追加の操作を送らず、5秒以内に停止して再接続しない", async () => {
  vi.useFakeTimers();
  const original = vi.mocked(apiFetch).getMockImplementation();
  vi.mocked(apiFetch).mockImplementation(async (input, options) => {
    const result = await original?.(input, options);
    if ((input instanceof Request ? input.url : String(input)).endsWith("/tools"))
      return Response.json({ result: { ending: true }, conversationAction: "end" });
    if (!result) throw new Error("HTTP fixtureが必要です");
    return result;
  });
  const { value, changes } = connection();
  await value.start("ja");
  delegate();
  receive({ type: "response.created", response: { id: "tablecast-end-response" } });
  for (const [call_id, name] of [
    ["tablecast-end-call", "endConversation"],
    ["tablecast-unwanted-call", "callStaff"],
  ])
    receive({
      type: "response.output_item.done",
      item: { type: "function_call", call_id, name, arguments: "{}" },
    });
  receive({ type: "response.completed", response: { id: "tablecast-end-response" } });
  await vi.advanceTimersByTimeAsync(100);
  expect(requests.filter(({ path }) => path.endsWith("/tools"))).toHaveLength(1);
  await vi.advanceTimersByTimeAsync(5000);
  expect(changes.at(-1)?.status).toBe("paused");
  expect(track.stop).toHaveBeenCalledOnce();
  expect(requests.filter(({ path }) => path.endsWith("/start"))).toHaveLength(1);
});
