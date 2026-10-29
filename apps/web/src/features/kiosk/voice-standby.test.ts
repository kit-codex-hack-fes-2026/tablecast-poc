import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { apiFetch } from "../../lib/api-fetch";
import { peer, track, voiceFixture } from "./test-support/voice-transport-fixture";
import { VoiceConnection } from "./voice-connection";
vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
let fixture: ReturnType<typeof voiceFixture>;
beforeEach(() => {
  fixture = voiceFixture();
});
afterEach(async () => fixture.dispose());
it("待受のマイクを再取得せず、60秒の無音でだけ待受復帰を許可する", async () => {
  vi.useFakeTimers();
  const value = new VoiceConnection(
    () => {},
    () => {},
  );
  fixture.connections.push(value);
  const microphone = new MediaStream();
  await value.start("fr", 1, "conversation", { activation: "wake_word", microphone });
  expect(fixture.capture).not.toHaveBeenCalled();
  expect(fixture.requests.find(({ path }) => path.endsWith("/start"))?.body).toMatchObject({
    activation: "wake_word",
  });
  await vi.advanceTimersByTimeAsync(59000);
  expect(value.getSnapshot().status).toBe("listening");
  peer().channel.receive({
    type: "session.output_transcript.delta",
    event_id: "tablecast-idle-caption",
    delta: "Bonjour",
    start_ms: 0,
    end_ms: 1000,
  });
  await vi.advanceTimersByTimeAsync(59000);
  expect(value.getSnapshot().status).not.toBe("paused");
  await vi.advanceTimersByTimeAsync(1000);
  expect(value.getSnapshot()).toMatchObject({ status: "paused", returnToStandby: true });
  expect(track.stop).toHaveBeenCalledOnce();
  await value.start("fr", 1, "conversation", { activation: "hand_raise" });
  await value.stop();
  expect(value.getSnapshot()).toMatchObject({ status: "paused", returnToStandby: false });
  await vi.advanceTimersByTimeAsync(60000);
  expect(fixture.requests.filter(({ path }) => path.endsWith("/start"))).toHaveLength(2);
});

it("無音終了の途中に明示停止されたら待受へ復帰しない", async () => {
  const value = new VoiceConnection(
    () => {},
    () => {},
  );
  fixture.connections.push(value);
  await value.start("ja", 1, "conversation", { activation: "hand_raise" });
  const idle = value.stop({ returnToStandby: true });
  const manual = value.stop();
  await Promise.all([idle, manual]);
  expect(value.getSnapshot()).toMatchObject({ status: "paused", returnToStandby: false });
});
