import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import * as business from "../src/db/business-schema";
import { getTableState } from "../src/modules/tables/queries";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import { agentBindings, mockAgentSessions, runVoiceTurn, voiceTurnText } from "./agents-fixture";
import { configuration, device, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const voiceId = "tablecast-proactive-voice";
const services = () => createApiServices(env);
const input = (turnId: string) => ({
  voiceSessionId: voiceId,
  turnId,
  locale: "ja",
  trigger: "proactive",
  messages: [],
});
async function setup(enabled = true) {
  await setupFixture();
  await setVoiceSession(services(), device, voiceId);
  await services()
    .db.update(business.stores)
    .set({
      config_json: JSON.stringify({
        ...configuration,
        cast: { ...configuration.cast, proactive: enabled },
      }),
    })
    .where(eq(business.stores.id, device.storeId));
}
it.each(["設定無効", "カートあり", "スタッフ対応中", "確認待ち", "生成中"])(
  "%sでは自発接客を開始しない",
  async (condition) => {
    await setup(condition !== "設定無効");
    if (condition === "カートあり")
      await services()
        .db.update(business.tableSessions)
        .set({ cart_json: "[{}]" })
        .where(eq(business.tableSessions.id, device.tableSessionId ?? ""));
    if (condition === "スタッフ対応中")
      await services()
        .db.update(business.tableSessions)
        .set({ staff_called: 1 })
        .where(eq(business.tableSessions.id, device.tableSessionId ?? ""));
    if (condition === "確認待ち")
      await services()
        .db.insert(business.confirmations)
        .values({
          id: "tablecast-confirmation",
          store_id: device.storeId,
          table_session_id: device.tableSessionId ?? "",
          cart_version: 0,
          config_version: 1,
          channel: "voice",
          status: "pending",
          snapshot_json: "{}",
          expires_at: Date.now() + 60_000,
          created_at: Date.now(),
        });
    if (condition === "生成中")
      await services().db.batch([
        services()
          .db.insert(business.voiceTurns)
          .values({
            id: "tablecast-busy-turn",
            voice_session_id: voiceId,
            table_session_id: device.tableSessionId ?? "",
            store_id: device.storeId,
            status: "started",
            started_at: Date.now(),
          }),
        services()
          .db.update(business.tableSessions)
          .set({ active_turn_id: "tablecast-busy-turn" })
          .where(eq(business.tableSessions.id, device.tableSessionId ?? "")),
      ]);
    const provider = mockAgentSessions([]);
    const running = await runVoiceTurn(input("tablecast-skipped"), {
      ...agentBindings(),
      TABLECAST_MODEL_API_KEY: "",
      TABLECAST_MODEL: "",
    });
    expect(running.result.kind).toBe("skipped");
    await running.finish();
    expect(provider.requests).toHaveLength(0);
  },
);
it("同時要求を一度だけ受け入れ、読取専用toolと180秒の間隔を維持する", async () => {
  await setup();
  const provider = mockAgentSessions([[{ text: "季節のお茶もございます。" }]]);
  const attempts = await Promise.all([
    runVoiceTurn(input("tablecast-proactive-a")),
    runVoiceTurn(input("tablecast-proactive-b")),
  ]);
  expect(attempts.map((attempt) => attempt.result.kind).toSorted()).toEqual(["skipped", "stream"]);
  const outputs = await Promise.all(
    attempts.map(async (attempt) => {
      const output = attempt.result.kind === "stream" ? await voiceTurnText(attempt.result) : null;
      await attempt.finish();
      return output;
    }),
  );
  expect(outputs.filter((output) => output !== null)).toEqual(["季節のお茶もございます。"]);
  expect(provider.requests[0]).toMatchObject({
    agent: { tools: [{ name: "getCatalog" }, { name: "getTableState" }] },
  });
  expect((await runVoiceTurn(input("tablecast-too-soon"))).result.kind).toBe("skipped");
  expect((await getTableState(services(), device)).orders).toHaveLength(0);
  expect(
    (await getTableState(services(), device)).events.filter((event) => event.kind === "voice.user"),
  ).toHaveLength(0);
});
it("自発接客でも古い音声資格・言語を拒否する", async () => {
  await setup();
  const provider = mockAgentSessions([]);
  for (const altered of [{ voiceSessionId: "tablecast-old-voice" }, { locale: "en" }])
    await expect(runVoiceTurn({ ...input("tablecast-stale"), ...altered })).rejects.toHaveProperty(
      "code",
    );
  expect(provider.requests).toHaveLength(0);
});
