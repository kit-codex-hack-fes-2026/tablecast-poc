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

async function start(toolName: "captureCamera" | "getCameraState" = "captureCamera") {
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
      name: toolName,
      arguments: toolName === "getCameraState" ? "{}" : '{"question":"何が見えますか？"}',
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
  const { value, finish } = await start();
  value.connectCamera({
    getState: () => ({ status: "off" }),
    capture: async () => ({ error: "CAMERA_OFF" }),
    complete: () => {},
  });
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

it("カメラ状態の照会は認可後に端末の許可拒否を返し、撮影や許可ダイアログを始めない", async () => {
  toolReply = Promise.resolve(Response.json({ result: { sessionAuthorized: true } }));
  const { value, finish } = await start("getCameraState");
  const capture = vi.fn<() => Promise<{ error: "CAMERA_UNAVAILABLE" }>>(async () => ({
    error: "CAMERA_UNAVAILABLE",
  }));
  value.connectCamera({
    getState: () => ({ status: "permission-denied" }),
    capture,
    complete: () => {},
  });
  finish();
  await vi.waitFor(() =>
    expect(
      peer().channel.send.mock.calls.some(([event]) => event.includes("permission-denied")),
    ).toBe(true),
  );
  const output = peer()
    .channel.send.mock.calls.map(([event]) =>
      z
        .looseObject({
          item: z.looseObject({ type: z.string(), output: z.string().optional() }).optional(),
        })
        .parse(JSON.parse(event)),
    )
    .find((event) => event.item?.type === "function_call_output");
  expect(JSON.parse(z.string().parse(output?.item?.output))).toEqual({
    sessionAuthorized: true,
    camera: { status: "permission-denied" },
  });
  expect(capture).not.toHaveBeenCalled();
  expect(peer().connectionState).toBe("connected");
});
it("認可失敗を端末の撮影許可と区別し、未認可では撮影しない", async () => {
  toolReply = Promise.resolve(
    Response.json(
      { error: { code: "VOICE_SESSION_STALE", message: "Session expired" } },
      { status: 409 },
    ),
  );
  const { value, finish } = await start();
  const capture = vi.fn<() => Promise<{ imageUrl: string }>>(async () => ({
    imageUrl: "data:image/jpeg;base64,dGFibGVjYXN0",
  }));
  value.connectCamera({
    getState: () => ({ status: "ready", facing: "environment" }),
    capture,
    complete: () => {},
  });
  finish();
  await vi.waitFor(() =>
    expect(
      peer().channel.send.mock.calls.some(([event]) => event.includes("VOICE_SESSION_STALE")),
    ).toBe(true),
  );
  const output = peer()
    .channel.send.mock.calls.map(([event]) =>
      z
        .looseObject({
          item: z.looseObject({ type: z.string(), output: z.string().optional() }).optional(),
        })
        .parse(JSON.parse(event)),
    )
    .find((event) => event.item?.type === "function_call_output");
  expect(JSON.parse(z.string().parse(output?.item?.output))).toMatchObject({
    sessionAuthorized: false,
    camera: { status: "ready" },
  });
  expect(capture).not.toHaveBeenCalled();
});
