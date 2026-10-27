import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { apiFetch } from "../../lib/api-fetch";
import { peer, voiceFixture } from "./test-support/voice-transport-fixture";
import { VoiceConnection, type VoiceView } from "./voice-connection";

vi.mock("../../lib/api-fetch", () => ({ apiFetch: vi.fn<typeof apiFetch>() }));
let fixture: ReturnType<typeof voiceFixture>;
beforeEach(() => {
  fixture = voiceFixture();
});
afterEach(async () => fixture.dispose());
const receive = (event: unknown) =>
  peer().channel.receive({ type: "response.event", delegation_id: "tablecast-search", event });
const caption = (delta: string, start_ms: number, end_ms: number) =>
  peer().channel.receive({
    type: "session.output_transcript.delta",
    event_id: crypto.randomUUID(),
    delta,
    start_ms,
    end_ms,
  });

async function start() {
  const changes: VoiceView[] = [];
  const voice = new VoiceConnection(
    (view) => changes.push(view),
    () => {},
  );
  fixture.connections.push(voice);
  await voice.start("ja");
  peer().channel.receive({
    type: "session.delegation.created",
    delegation: { id: "tablecast-search", target: "responses" },
  });
  receive({ type: "response.created", response: { id: "tablecast-search-response" } });
  return { voice, changes };
}
it("実イベントの検索状態・公開推論要約・出典を表示し、完了後も要約を残す", async () => {
  const { changes } = await start();
  receive({ type: "response.web_search_call.searching" });
  expect(changes.at(-1)?.progress?.stage).toBe("searching");
  receive({
    type: "response.reasoning_summary_text.delta",
    delta: "公開された資料を確認しています。",
  });
  receive({
    type: "response.output_text.annotation.added",
    annotation: { type: "url_citation", url: "https://example.com/tea", title: "Tea guide" },
  });
  receive({
    type: "response.output_text.annotation.added",
    annotation: { type: "url_citation", url: "https://example.com/tea", title: "Duplicate" },
  });
  expect(changes.at(-1)?.progress?.summary).toBe("公開された資料を確認しています。");
  expect(changes.at(-1)?.citations).toEqual([
    { url: "https://example.com/tea", title: "Tea guide" },
  ]);
  receive({ type: "response.completed", response: { id: "tablecast-search-response" } });
  await vi.waitFor(() =>
    expect(fixture.requests.some(({ path }) => path.endsWith("/finish"))).toBe(true),
  );
  expect(changes.at(-1)?.progress?.summary).toBe("公開された資料を確認しています。");
});
it("言語切替後の古い検索・推論イベントは新しい画面へ表示しない", async () => {
  const { voice, changes } = await start();
  voice.synchronise("live_tablecast_1", true, 1, "en");
  receive({ type: "response.created", response: { id: "tablecast-search-late" } });
  receive({ type: "response.reasoning_summary_text.delta", delta: "古い要約" });
  receive({ type: "response.web_search_call.searching" });
  receive({
    type: "response.output_text.annotation.added",
    annotation: { type: "url_citation", url: "https://example.com/old", title: "古い出典" },
  });
  expect(changes.at(-1)?.progress).toBeUndefined();
  expect(changes.at(-1)?.citations).toEqual([]);
  expect(peer().connectionState).toBe("connected");
});

it("言語切替中の字幕は旧言語のまま確定し、遅着した断片を新言語へ連結しない", async () => {
  vi.useFakeTimers();
  const { voice, changes } = await start();
  caption("お茶です", 100, 500);
  voice.synchronise("live_tablecast_1", true, 1, "en");
  caption("古い断片", 400, 600);
  caption("Tea", 800, 1000);
  await vi.advanceTimersByTimeAsync(1500);
  expect(changes.at(-1)?.messages).toMatchObject([
    { text: "お茶です", locale: "ja", final: true, interrupted: true },
    { text: "Tea", locale: "en" },
  ]);
  expect(fixture.requests.find(({ path }) => path.endsWith("/conversation"))?.body).toMatchObject({
    items: [expect.objectContaining({ locale: "ja", text: "お茶です" })],
  });
});
