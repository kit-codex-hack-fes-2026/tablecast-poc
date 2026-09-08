import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import app from "../src/app";
import { getTableState, setVoiceSession } from "../src/modules/operations";
import { device, setupFixture } from "./fixture";

const voiceId = "tablecast-realtime-fixture";
const headers = {
  authorization: "Bearer tablecast-test-voice-token",
  "content-type": "application/json",
};
async function request(path: string, body?: object) {
  const context = createExecutionContext();
  const response = await app.request(
    `/internal/voice/${path}`,
    { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) },
    {
      ...env,
      TABLECAST_MODEL: "gpt-5.6-luna",
      TABLECAST_MODEL_API_KEY: "tablecast-test-model-key",
    },
    context,
  );
  await waitOnExecutionContext(context);
  return response;
}
async function start(turnId = "tablecast-turn") {
  return request("turns", {
    transport: "realtime",
    voiceSessionId: voiceId,
    turnId,
    locale: "ja",
    messages: [{ role: "user", content: "" }],
  });
}
async function setup() {
  await setupFixture();
  await setVoiceSession(env, device, voiceId);
  expect((await start()).status).toBe(200);
}
const tool = (
  toolName: string,
  args = {},
  turnId = "tablecast-turn",
  toolCallId = crypto.randomUUID(),
) =>
  request("tools", {
    voiceSessionId: voiceId,
    turnId,
    toolName,
    toolCallId,
    arguments: args,
  });

describe("Realtimeの音声認可と業務ツール境界", () => {
  it("字幕を待たずに開始しAPIの正本からモデルとツールを取得する", async () => {
    await setup();
    const response = await request(`realtime?voiceSessionId=${voiceId}`);
    const config = z
      .object({ model: z.string(), tools: z.array(z.object({ name: z.string() })) })
      .parse(await response.json());
    expect(config.model).toBe("gpt-realtime-2.1");
    expect(config.tools.map((item) => item.name)).toContain("updateCart");
    expect(JSON.stringify(config)).not.toContain("tablecast-test-model-key");
    expect((await tool("getCatalog")).status).toBe(200);
    expect((await tool("setSpeechSpeed", { speed: 1.5 })).status).toBe(200);
    expect((await getTableState(env, device)).speechSpeed).toBe(1.5);
  });
  it("不正な引数と新ターン開始後の旧ツールを拒否する", async () => {
    await setup();
    expect((await tool("setSpeechSpeed", { speed: 1.6 })).status).toBe(422);
    expect((await start("tablecast-next")).status).toBe(200);
    expect((await tool("setSpeechSpeed", { speed: 0.5 })).status).toBe(409);
    expect((await getTableState(env, device)).speechSpeed).toBe(1);
  });
  it("同じcall IDの並行要求を一回だけ実行する", async () => {
    await setup();
    const responses = await Promise.all([
      tool("getCatalog", {}, "tablecast-turn", "tablecast-call"),
      tool("getCatalog", {}, "tablecast-turn", "tablecast-call"),
    ]);
    expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual([200, 409]);
  });
  it("遅れて届いた字幕を元のターンだけへ保存する", async () => {
    await setup();
    await start("tablecast-next");
    expect(
      (
        await request("transcript", {
          voiceSessionId: voiceId,
          turnId: "tablecast-turn",
          text: "ほうじ茶を一つ",
        })
      ).status,
    ).toBe(200);
    const row = await env.TABLECAST_DB.prepare(
      "SELECT data_json FROM table_events WHERE kind='voice.user' AND json_extract(data_json,'$.turnId')='tablecast-turn'",
    ).first<string>("data_json");
    expect(JSON.parse(row ?? "{}")).toMatchObject({ text: "ほうじ茶を一つ", speaker: null });
    expect((await tool("getTableState", {}, "tablecast-next")).status).toBe(200);
  });
  it("固定確認の読み上げ前と同じ発話での送信を拒否し、新発話の承認で送信する", async () => {
    await setup();
    expect(
      (
        await tool("updateCart", {
          expectedVersion: 0,
          lines: [{ id: "tablecast-tea", productId: "tea", quantity: 1, selections: [] }],
        })
      ).status,
    ).toBe(200);
    const prepared = z
      .object({ result: z.object({ snapshotId: z.string() }) })
      .parse(await (await tool("prepareConfirmation", { expectedVersion: 1 })).json());
    const approval = {
      snapshotId: prepared.result.snapshotId,
      approved: true,
      idempotencyKey: "tablecast-submit",
    };
    expect((await tool("submitOrder", approval)).status).toBe(409);
    expect(
      (
        await request("confirmations/read", {
          voiceSessionId: voiceId,
          turnId: "tablecast-turn",
          snapshotId: approval.snapshotId,
        })
      ).status,
    ).toBe(200);
    expect((await tool("submitOrder", approval)).status).toBe(409);
    await start("tablecast-approval");
    expect((await tool("submitOrder", approval, "tablecast-approval")).status).toBe(200);
    expect((await getTableState(env, device)).orders).toHaveLength(1);
  });
  it("自発接客のturnでは業務を変更できない", async () => {
    await setupFixture();
    await setVoiceSession(env, device, voiceId);
    await env.TABLECAST_DB.prepare(
      "UPDATE stores SET config_json=json_set(config_json,'$.cast.proactive',json('true')) WHERE id=?",
    )
      .bind(device.storeId)
      .run();
    expect(
      (
        await request("turns", {
          transport: "realtime",
          voiceSessionId: voiceId,
          turnId: "tablecast-proactive",
          locale: "ja",
          trigger: "proactive",
          messages: [],
        })
      ).status,
    ).toBe(200);
    expect((await tool("getCatalog", {}, "tablecast-proactive")).status).toBe(200);
    expect((await tool("callStaff", {}, "tablecast-proactive")).status).toBe(403);
  });
  it("音声停止後は設定取得も業務操作も拒否する", async () => {
    await setup();
    await setVoiceSession(env, device, null);
    expect((await request(`realtime?voiceSessionId=${voiceId}`)).status).toBe(409);
    expect((await tool("getCatalog")).status).toBe(409);
  });
});
