import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiFetch } from "../../lib/api-fetch";
import { deferred, peer, voiceFixture } from "./test-support/voice-transport-fixture";
import { VoiceConnection } from "./voice-connection";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
let fixture: ReturnType<typeof voiceFixture>;
let toolReply: Promise<Response> | undefined;
beforeEach(() => {
  fixture = voiceFixture();
  toolReply = undefined;
  const original = vi.mocked(apiFetch).getMockImplementation();
  vi.mocked(apiFetch).mockImplementation(async (input, options) => {
    const response = await original?.(input, options);
    if ((input instanceof Request ? input.url : String(input)).endsWith("/tools"))
      return (
        toolReply ??
        Response.json({ result: { question: "何が見えますか？" }, cameraAction: "capture" })
      );
    if (!response) throw new Error("HTTP fixtureが必要です");
    return response;
  });
});
afterEach(async () => fixture.dispose());
const receive = (event: unknown) =>
  peer().channel.receive({
    type: "response.event",
    delegation_id: "tablecast-camera-delegation",
    event,
  });

async function start() {
  const value = new VoiceConnection(
    () => {},
    () => {},
  );
  fixture.connections.push(value);
  await value.start("ja");
  peer().channel.receive({
    type: "session.delegation.created",
    delegation: { id: "tablecast-camera-delegation", target: "responses" },
  });
  receive({ type: "response.created", response: { id: "tablecast-camera-response" } });
  receive({
    type: "response.output_item.done",
    item: {
      type: "function_call",
      call_id: "tablecast-camera-call",
      name: "captureCamera",
      arguments: '{"question":"何が見えますか？"}',
    },
  });
  return {
    value,
    finish: () =>
      receive({ type: "response.completed", response: { id: "tablecast-camera-response" } }),
  };
}

it("認可された取得で画像をResponsesへ送り、API・会話履歴へ複製しない", async () => {
  const { value, finish } = await start();
  const capture = vi.fn<() => Promise<{ imageUrl: string }>>(async () => ({
    imageUrl: "data:image/jpeg;base64,dGFibGVjYXN0",
  }));
  value.connectCamera({ capture, complete: () => {} });
  finish();
  await vi.waitFor(() => expect(capture).toHaveBeenCalledOnce());
  await vi.waitFor(() =>
    expect(
      peer().channel.send.mock.calls.some(([event]) => event.includes('"type":"input_image"')),
    ).toBe(true),
  );
  expect(JSON.stringify(fixture.requests)).not.toContain("data:image");
  expect(fixture.requests.some(({ path }) => path.endsWith("/conversation"))).toBe(false);
});

it("カメラOFFでもtool結果を返し、接続を閉じずに継続する", async () => {
  const { finish } = await start();
  finish();
  await vi.waitFor(() =>
    expect(peer().channel.send.mock.calls.some(([event]) => event.includes("CAMERA_OFF"))).toBe(
      true,
    ),
  );
  expect(peer().connectionState).toBe("connected");
  expect(
    peer().channel.send.mock.calls.filter(
      ([data]) => z.object({ type: z.string() }).parse(JSON.parse(data)).type === "response.create",
    ),
  ).toHaveLength(1);
});

it("認可待ちに停止した場合は遅着結果で撮影を始めない", async () => {
  const pending = deferred<Response>();
  toolReply = pending.promise;
  const { value, finish } = await start();
  const capture = vi.fn<() => Promise<{ imageUrl: string }>>(async () => ({
    imageUrl: "data:image/jpeg;base64,dGFibGVjYXN0",
  }));
  value.connectCamera({ capture, complete: () => {} });
  finish();
  await vi.waitFor(() =>
    expect(fixture.requests.some(({ path }) => path.endsWith("/tools"))).toBe(true),
  );
  await value.stop();
  pending.resolve(
    Response.json({ result: { question: "何が見えますか？" }, cameraAction: "capture" }),
  );
  await vi.waitFor(() => expect(peer().connectionState).toBe("closed"));
  expect(capture).not.toHaveBeenCalled();
});
