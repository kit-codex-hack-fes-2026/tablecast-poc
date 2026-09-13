import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as business from "../src/db/business-schema";
import { setVoiceSession } from "../src/modules/voice/service";
import { getTableState } from "../src/modules/tables/queries";
import { invokeVoiceTool } from "../src/modules/voice/realtime";
import { finishVoiceTurn } from "../src/modules/voice/turns";
import { createApiServices } from "../src/platform/context";
import { runVoiceTurn } from "./voice-fixture";
import { device, setupFixture } from "./fixture";
afterEach(() => vi.restoreAllMocks());
const services = () => createApiServices(env);
const voiceId = "tablecast-direct-voice";
const input = (turnId: string) => ({ voiceSessionId: voiceId, turnId, locale: "ja", messages: [] });
async function setup() {
  await setupFixture();
  await setVoiceSession(services(), device, voiceId);
}
describe("標準Responses委任の業務境界", () => {
  it("モデル通信を挟まず登録し同じ委任の再送を拒否する", async () => {
    await setup();
    const fetch = vi.spyOn(globalThis, "fetch");
    const first = await runVoiceTurn(input("tablecast-first"));
    await first.finish();
    expect(first.result).toEqual({ kind: "accepted", turnId: "tablecast-first" });
    await expect(runVoiceTurn(input("tablecast-first"))).rejects.toHaveProperty("code");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("新しい委任で古い業務操作を拒否し、失敗表示を終端にする", async () => {
    await setup();
    await (await runVoiceTurn(input("tablecast-old"))).finish();
    await (await runVoiceTurn(input("tablecast-new"))).finish();
    await expect(
      invokeVoiceTool(
        services(),
        {
          voiceSessionId: voiceId,
          turnId: "tablecast-old",
          toolName: "callStaff",
          toolCallId: "tablecast-late",
          arguments: {},
        },
        new AbortController().signal,
      ),
    ).rejects.toHaveProperty("code");
    expect((await getTableState(services(), device)).staffCalled).toBe(false);
    await finishVoiceTurn(services(), voiceId, "tablecast-new", "failed");
    const state = await getTableState(services(), device);
    expect(state.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "voice.failed" })]),
    );
  });
  it.each([{ voiceSessionId: "tablecast-other" }, { locale: "en" }])(
    "古い音声資格や言語を拒否する %j",
    async (altered) => {
      await setup();
      await expect(
        runVoiceTurn({ ...input("tablecast-stale"), ...altered }),
      ).rejects.toHaveProperty("code");
      expect(await services().db.select().from(business.voiceTurns)).toHaveLength(0);
    },
  );
  it("停止後に遅着したツールを実行しない", async () => {
    await setup();
    await (await runVoiceTurn(input("tablecast-turn"))).finish();
    await setVoiceSession(services(), device, null);
    await expect(
      invokeVoiceTool(
        services(),
        {
          voiceSessionId: voiceId,
          turnId: "tablecast-turn",
          toolName: "callStaff",
          toolCallId: "tablecast-stopped",
          arguments: {},
        },
        new AbortController().signal,
      ),
    ).rejects.toHaveProperty("code");
    const row = await services()
      .db.select()
      .from(business.tableSessions)
      .where(eq(business.tableSessions.id, device.tableSessionId ?? ""))
      .get();
    expect(row?.staff_called).toBe(0);
  });
});
