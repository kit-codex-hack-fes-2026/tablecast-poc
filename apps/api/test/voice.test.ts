import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { and, eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as business from "../src/db/business-schema";
import app from "../src/app";
import { getVoiceConfirmation, updateCart } from "../src/modules/orders/service";
import { getTableState } from "../src/modules/tables/queries";
import { setVoiceSession } from "../src/modules/voice/service";
import { createApiServices } from "../src/platform/context";
import {
  agentBindings,
  mockAgentSessions,
  runVoiceTurn,
  voiceTurnText as body,
} from "./agents-fixture";
import { device, deviceToken, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());
const voiceId = "tablecast-voice-test";
const input = (turnId = "tablecast-turn") => ({
  voiceSessionId: voiceId,
  turnId,
  locale: "ja",
  messages: [{ role: "user", content: "お茶をください" }],
});
async function setup() {
  await setupFixture();
  await setVoiceSession(createApiServices(env), device, voiceId);
}
const state = () => getTableState(createApiServices(env), device);
const turn = (id = "tablecast-turn") =>
  createApiServices(env)
    .db.select()
    .from(business.voiceTurns)
    .where(eq(business.voiceTurns.id, id))
    .get();

describe("音声委任とhosted Agents API", () => {
  it.each([false, true])("認証済みHTTP委任の失敗%sをSSEの明示terminalで返す", async (failure) => {
    await setup();
    mockAgentSessions([
      failure
        ? [{ text: "確認中です。", phase: "commentary" }, { providerToolFailure: true }]
        : [{ text: "ほうじ茶は400円です。" }],
    ]);
    const context = createExecutionContext();
    const response = await app.request(
      new Request("http://localhost:3000/api/table/voice/delegations", {
        method: "POST",
        headers: {
          Cookie: `tablecast.device=${deviceToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          voiceSessionId: voiceId,
          delegationId: "tablecast-delegation",
          locale: "ja",
          messages: [{ role: "user", content: "お茶をください" }],
          trigger: "user",
        }),
      }),
      undefined,
      agentBindings(),
      context,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe(
      failure
        ? 'event: failed\ndata: {"code":"VOICE_MODEL_FAILED"}\n\n'
        : 'event: delta\ndata: {"delta":"ほうじ茶は400円です。"}\n\nevent: completed\ndata: {}\n\n',
    );
    await waitOnExecutionContext(context);
  });
  it.each(["commentary", null] as const)(
    "phase=%sの進捗を転送せず、final_answerだけを成功通知より先に配信する",
    async (phase) => {
      await setup();
      mockAgentSessions([
        [{ text: "確認してご案内します。", phase }, { text: "ほうじ茶は400円です。" }],
      ]);
      const running = await runVoiceTurn(input());
      expect(await body(running.result)).toBe("ほうじ茶は400円です。");
      await running.finish();
      expect((await turn())?.status).toBe("completed");
    },
  );
  it("進捗後のprovider失敗を本文や正常EOFにせずfailedイベントとして配信する", async () => {
    await setup();
    mockAgentSessions([
      [{ text: "お茶を確認します。", phase: "commentary" }, { providerToolFailure: true }],
    ]);
    const running = await runVoiceTurn(input());
    if (running.result.kind !== "stream") throw new Error("応答streamがない");
    const reader = running.result.stream.getReader();
    expect((await reader.read()).value).toEqual({
      event: "failed",
      data: JSON.stringify({ code: "VOICE_MODEL_FAILED" }),
    });
    expect((await reader.read()).done).toBe(true);
    await running.finish();
    expect((await turn())?.status).toBe("failed");
  });
  it("最終回答がない完了を業務結果として正常終了にしない", async () => {
    await setup();
    mockAgentSessions([[{ text: "確認してご案内します。", phase: "commentary" }]]);
    const running = await runVoiceTurn(input());
    await expect(body(running.result)).rejects.toMatchObject({ code: "VOICE_MODEL_FAILED" });
    await running.finish();
    expect((await turn())?.status).toBe("failed");
  });
  it("実toolへ委任して生成途中から本文を返し、完了イベントでturnを終了する", async () => {
    await setup();
    const release = Promise.withResolvers<void>();
    const provider = mockAgentSessions([
      [
        { text: "確認します。" },
        { wait: release.promise },
        {
          tool: "updateCart",
          arguments: {
            expectedVersion: 0,
            lines: [{ id: "tea-line", productId: "tea", quantity: 1, selections: [] }],
          },
        },
        { text: "追加しました。" },
      ],
    ]);
    const running = await runVoiceTurn(input());
    if (running.result.kind !== "stream") throw new Error("応答streamがない");
    const reader = running.result.stream.getReader();
    expect((await reader.read()).value).toEqual({
      event: "delta",
      data: JSON.stringify({ delta: "確認します。" }),
    });
    expect((await state()).cart.lines).toHaveLength(0);
    expect((await turn())?.status).toBe("started");
    release.resolve();
    const rest = [];
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      rest.push(chunk.value);
    }
    await running.finish();
    expect(rest).toEqual([
      { event: "delta", data: JSON.stringify({ delta: "追加しました。" }) },
      { event: "completed", data: "{}" },
    ]);
    expect((await state()).cart.lines).toHaveLength(1);
    expect(await turn()).toMatchObject({
      status: "completed",
      agent_session_id: "tablecast-agent-1",
    });
    expect(provider.requests[0]).toMatchObject({
      environment: { type: "none" },
      agent: { model: "gpt-5.6-luna", reasoning: { effort: "low" } },
    });
    expect(provider.toolResults).toHaveLength(1);
    expect((await turn())?.agent_finished_at).not.toBeNull();
    expect(
      (await state()).events
        .filter((event) => event.kind === "voice.turn")
        .map((event) => event.data.status),
    ).toEqual(["started", "completed"]);
    expect(
      (await state()).events
        .filter((event) => event.kind === "voice.tool")
        .map((event) => event.data.state),
    ).toEqual(["running", "completed"]);
  });
  it.each(["途中失敗", "完了通知なし"])("%sを正常終了にせず失敗を保存する", async (scenario) => {
    await setup();
    mockAgentSessions(
      [
        scenario === "途中失敗"
          ? [{ text: "確認します。" }, { failure: true }]
          : [{ text: "確認します。" }],
      ],
      { premature: scenario === "完了通知なし" },
    );
    const running = await runVoiceTurn(input());
    await expect(body(running.result)).rejects.toMatchObject({ code: "VOICE_MODEL_FAILED" });
    await running.finish();
    expect((await turn())?.status).toBe("failed");
    expect((await state()).events.some((event) => event.kind === "voice.failed")).toBe(true);
  });
  it("業務toolへ届かないprovider内の呼出し失敗を正常完了にせず、詳細を伏せて終了する", async () => {
    await setup();
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = Promise.withResolvers<void>();
    const provider = mockAgentSessions([
      [{ providerToolFailure: true }, { wait: pending.promise }],
    ]);
    const running = await runVoiceTurn(input());
    await expect(body(running.result)).rejects.toMatchObject({ code: "VOICE_MODEL_FAILED" });
    await running.finish();
    pending.resolve();
    expect(provider.cancellations).toEqual(["tablecast-agent-1"]);
    expect(provider.toolResults).toHaveLength(0);
    expect((await turn())?.status).toBe("failed");
    expect(
      (await state()).events
        .filter((event) => event.kind === "voice.turn")
        .map((event) => event.data.status),
    ).toEqual(["started", "failed"]);
    expect(JSON.stringify(output.mock.calls)).not.toContain("tablecast-private-provider-error");
  });
  it.each(["応答取消", "HTTP取消"])(
    "%sでhosted生成も明示取消し、カートを保持する",
    async (mode) => {
      await setup();
      const pending = Promise.withResolvers<void>();
      const provider = mockAgentSessions([[{ text: "確認します。" }, { wait: pending.promise }]]);
      const cancellation = new AbortController();
      const running = await runVoiceTurn(input(), undefined, cancellation.signal);
      if (running.result.kind !== "stream") throw new Error("応答streamがない");
      const reader = running.result.stream.getReader();
      await reader.read();
      let outcome: unknown;
      if (mode === "応答取消") {
        await reader.cancel();
        outcome = "VOICE_CANCELLED";
      } else {
        cancellation.abort();
        outcome = (await reader.read()).value;
      }
      expect(outcome).toEqual(
        mode === "応答取消"
          ? "VOICE_CANCELLED"
          : { event: "failed", data: JSON.stringify({ code: "VOICE_CANCELLED" }) },
      );
      pending.resolve();
      await running.finish();
      expect(provider.cancellations).toEqual(["tablecast-agent-1"]);
      expect(await turn()).toMatchObject({
        status: "interrupted",
      });
      expect((await state()).cart.lines).toHaveLength(0);
    },
  );
  it("同じ委任IDの再送をモデル呼出し前に拒否する", async () => {
    await setup();
    const provider = mockAgentSessions([[{ text: "はい。" }]]);
    const first = await runVoiceTurn(input());
    await body(first.result);
    await first.finish();
    await expect(runVoiceTurn(input())).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
    expect(provider.requests).toHaveLength(1);
  });
  it("停止中に遅れて作成されたhosted sessionも明示取消し、業務toolを実行しない", async () => {
    await setup();
    const release = Promise.withResolvers<void>();
    const provider = mockAgentSessions([[{ tool: "callStaff", arguments: {} }]], {
      createGate: release.promise,
    });
    const running = await runVoiceTurn(input());
    await vi.waitFor(() => expect(provider.requests).toHaveLength(1));
    await setVoiceSession(createApiServices(env), device, null);
    release.resolve();
    await expect(body(running.result)).rejects.toMatchObject({ code: "VOICE_CANCELLED" });
    await running.finish();
    expect(provider.cancellations).toEqual(["tablecast-agent-1"]);
    expect((await state()).staffCalled).toBe(false);
    expect((await turn())?.agent_finished_at).not.toBeNull();
  });
  it("HTTPが作成通知より先に閉じてもsession IDを取得して取消する", async () => {
    await setup();
    const release = Promise.withResolvers<void>();
    const cancellation = new AbortController();
    const provider = mockAgentSessions([[{ tool: "callStaff", arguments: {} }]], {
      createGate: release.promise,
    });
    const running = await runVoiceTurn(input(), undefined, cancellation.signal);
    await vi.waitFor(() => expect(provider.requests).toHaveLength(1));
    cancellation.abort();
    release.resolve();
    await expect(body(running.result)).rejects.toMatchObject({ code: "VOICE_CANCELLED" });
    await running.finish();
    expect(provider.cancellations).toEqual(["tablecast-agent-1"]);
    expect((await turn())?.agent_finished_at).not.toBeNull();
    expect((await state()).staffCalled).toBe(false);
    expect(
      (await state()).events
        .filter((event) => event.kind === "voice.turn")
        .map((event) => event.data.status),
    ).toEqual(["started", "interrupted"]);
  });
  it("次の委任が始まったら古いsessionだけを取消し、両方の終了をUIへ残す", async () => {
    await setup();
    const release = Promise.withResolvers<void>();
    const provider = mockAgentSessions([
      [{ text: "確認中です。" }, { wait: release.promise }],
      [{ text: "新しいご依頼です。" }],
    ]);
    const first = await runVoiceTurn(input());
    if (first.result.kind !== "stream") throw new Error("応答streamがない");
    const reader = first.result.stream.getReader();
    await reader.read();
    const firstResult = reader.read();
    const next = await runVoiceTurn(input("tablecast-next-turn"));
    expect(await body(next.result)).toBe("新しいご依頼です。");
    expect((await firstResult).value).toEqual({
      event: "failed",
      data: JSON.stringify({ code: "VOICE_CANCELLED" }),
    });
    release.resolve();
    await Promise.all([first.finish(), next.finish()]);
    expect(provider.cancellations).toEqual(["tablecast-agent-1"]);
    const lifecycle = (await state()).events
      .filter((event) => event.kind === "voice.turn")
      .map((event) => event.data);
    expect(lifecycle).toEqual(
      expect.arrayContaining([
        { turnId: "tablecast-turn", status: "interrupted" },
        { turnId: "tablecast-next-turn", status: "completed" },
      ]),
    );
    expect(
      lifecycle.filter(
        (event) => event.turnId === "tablecast-turn" && event.status === "interrupted",
      ),
    ).toHaveLength(1);
  });
  it("業務失敗をtool結果で返し、ツール表示を終了する", async () => {
    await setup();
    const provider = mockAgentSessions([
      [
        { tool: "showProducts", arguments: { productIds: ["missing"] } },
        { text: "商品を確認できません。" },
      ],
    ]);
    const running = await runVoiceTurn(input());
    expect(await body(running.result)).toBe("商品を確認できません。");
    await running.finish();
    expect(provider.toolResults[0]).toMatchObject({ success: false });
    expect(
      (await state()).events
        .filter((event) => event.kind === "voice.tool")
        .map((event) => event.data.state),
    ).toEqual(["running", "error"]);
  });
  it("ツール呼出し上限で待機を続けずhosted sessionを停止する", async () => {
    await setup();
    const provider = mockAgentSessions([
      Array.from({ length: 9 }, (_, index) => ({
        tool: "getTableState",
        arguments: {},
        callId: `tablecast-call-${index}`,
      })),
    ]);
    const running = await runVoiceTurn(input());
    await expect(body(running.result)).rejects.toMatchObject({ code: "VOICE_MODEL_FAILED" });
    await running.finish();
    expect(provider.toolResults).toHaveLength(8);
    expect(provider.cancellations).toEqual(["tablecast-agent-1"]);
  });
  it("確認を作った発話では注文せず、次の客発話で承認する", async () => {
    await setup();
    await updateCart(createApiServices(env), device, {
      expectedVersion: 0,
      lines: [{ id: "tea-line", productId: "tea", quantity: 2, selections: [] }],
    });
    mockAgentSessions([
      [
        { tool: "prepareConfirmation", arguments: { expectedVersion: 1 } },
        { text: "注文してよろしいですか。" },
      ],
    ]);
    const prepared = await runVoiceTurn(input());
    await body(prepared.result);
    await prepared.finish();
    expect((await state()).orders).toHaveLength(0);
    const confirmation = await getVoiceConfirmation(createApiServices(env), {
      ...device,
      kind: "voice",
      voiceSessionId: voiceId,
      turnId: "tablecast-turn",
    });
    expect(confirmation?.status).toBe("pending");
    vi.restoreAllMocks();
    mockAgentSessions([
      [
        {
          tool: "submitOrder",
          callId: "tablecast-submit-call",
          arguments: {
            snapshotId: confirmation?.id,
            approved: true,
            idempotencyKey: "tablecast-submitted",
          },
        },
        { text: "承りました。" },
      ],
    ]);
    const approval = await runVoiceTurn({
      ...input("tablecast-approval"),
      messages: [{ role: "user", content: "はい、注文してください" }],
    });
    await body(approval.result);
    await approval.finish();
    expect((await state()).orders).toHaveLength(1);
  });
  it("別の卓・停止済み音声資格・古い言語で業務推論を開始しない", async () => {
    await setup();
    const provider = mockAgentSessions([]);
    await expect(
      runVoiceTurn({ ...input(), voiceSessionId: "tablecast-other-voice" }),
    ).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
    await expect(runVoiceTurn({ ...input(), locale: "en" })).rejects.toMatchObject({
      code: "VOICE_LOCALE_STALE",
    });
    await setVoiceSession(createApiServices(env), device, null);
    await expect(runVoiceTurn(input())).rejects.toMatchObject({ code: "VOICE_SESSION_STALE" });
    expect(provider.requests).toHaveLength(0);
    expect(
      await createApiServices(env)
        .db.select()
        .from(business.voiceTurns)
        .where(and(eq(business.voiceTurns.store_id, device.storeId))),
    ).toHaveLength(0);
  });
});
