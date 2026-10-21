import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/app";
import * as businessTables from "../src/db/business-schema";
import { updateCart } from "../src/modules/orders/use-cases/cart";
import { prepareConfirmation } from "../src/modules/orders/use-cases/confirmation";
import { submitOrder } from "../src/modules/orders/use-cases/submit";
import { getTableState } from "../src/modules/tables/queries";
import { closeTable } from "../src/modules/tables/use-cases/lifecycle";
import { changeLocale } from "../src/modules/tables/use-cases/presentation";
import { setVoiceSession } from "../src/modules/voice/service";
import { finishVoiceTurn } from "../src/modules/voice/turns";
import { createApiServices } from "../src/platform/context";
import { tableStateSchema } from "../src/schema";
import { insertFixture } from "./database-fixture";
import { device, deviceToken, setupFixture } from "./fixture";

afterEach(() => vi.restoreAllMocks());

const stop = (voiceSessionId: string) =>
  exports.default.fetch(
    new Request("http://localhost:3000/api/table/voice/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `tablecast.device=${deviceToken}` },
      body: JSON.stringify({ voiceSessionId }),
    }),
  );

const teaLine = { id: "line-1", productId: "tea", quantity: 2, selections: [] };

const tea = [teaLine];
describe("実D1の注文契約", () => {
  it("音声停止と古いturn中断で確定カートを保持し、遅延した追加操作を拒否する", async () => {
    await setupFixture();
    await setVoiceSession(createApiServices(env), device, "tablecast-voice-session");
    await env.TABLECAST_DB.prepare(
      "UPDATE table_sessions SET active_turn_id='tablecast-turn' WHERE id=?",
    )
      .bind(device.tableSessionId)
      .run();
    await insertFixture(businessTables.voiceTurns, {
      id: "tablecast-turn",
      voice_session_id: "tablecast-voice-session",
      table_session_id: "tablecast-session",
      store_id: "tablecast-store",
      status: "started",
      started_at: Date.now(),
      ended_at: null,
    }).run();
    const voice = {
      ...device,
      kind: "voice" as const,
      voiceSessionId: "tablecast-voice-session",
      turnId: "tablecast-turn",
    };
    await updateCart(createApiServices(env), voice, { expectedVersion: 0, lines: tea });
    await setVoiceSession(createApiServices(env), device, null);
    await finishVoiceTurn(
      createApiServices(env),
      "tablecast-voice-session",
      "tablecast-turn",
      "interrupted",
    );
    await expect(
      updateCart(createApiServices(env), voice, { expectedVersion: 1, lines: [] }),
    ).rejects.toMatchObject({
      code: "VOICE_SESSION_STALE",
    });
    const state = await getTableState(createApiServices(env), device);
    expect(state.cart.total).toBe(800);
    expect(state.voiceState).toBe("stopped");
  });
});

it("停止操作が先行した場合は遅れて完了した音声開始をDBでも拒否する", async () => {
  await setupFixture();
  await setVoiceSession(createApiServices(env), device, null);
  await expect(
    setVoiceSession(createApiServices(env), device, "tablecast-late-start", undefined, 0),
  ).rejects.toMatchObject({ code: "SESSION_STALE" });
  expect((await getTableState(createApiServices(env), device)).voiceState).toBe("stopped");
});

it("別タブからの二重音声開始を拒否して元のsessionを維持する", async () => {
  await setupFixture();
  await setVoiceSession(createApiServices(env), device, "tablecast-original-voice");
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/api/table/voice/start", {
      method: "POST",
      headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sdp: "tablecast-sdp-offer" }),
    }),
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "VOICE_ALREADY_ACTIVE" } });
  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT voice_session_id,voice_version FROM table_sessions WHERE id=?",
    )
      .bind(device.tableSessionId)
      .first(),
  ).toEqual({ voice_session_id: "tablecast-original-voice", voice_version: 1 });
});

it.each(["false", "true"])(
  "音声有効設定%sに従い、無効時はLive sessionを発行しない",
  async (enabled) => {
    await setupFixture();
    await env.TABLECAST_DB.prepare(
      "UPDATE stores SET config_json=json_set(config_json,'$.cast.voice.ja','tablecast-voice-fixture-ja','$.cast.voice.en','tablecast-voice-fixture-en') WHERE id='tablecast-store'",
    ).run();
    const provider = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        session: { id: "tablecast-live-created" },
        transport: { type: "webrtc", sdp: "tablecast-sdp-answer" },
      }),
    );
    const ctx = createExecutionContext();
    const response = await app.request(
      new Request("http://localhost:3000/api/table/voice/start", {
        method: "POST",
        headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: "tablecast-sdp-offer" }),
      }),
      undefined,
      {
        ...env,
        TABLECAST_VOICE_ENABLED: enabled,
        TABLECAST_MODEL_API_KEY: "tablecast-test-model-key",
        TABLECAST_MODEL: "gpt-6-luna",
      },
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(provider).toHaveBeenCalledTimes(enabled === "true" ? 1 : 0);
    expect(response.status).toBe(enabled === "true" ? 200 : 503);
    expect((await getTableState(createApiServices(env), device)).voiceState).toBe(
      enabled === "true" ? "active" : "stopped",
    );
  },
);

it.each(["音声停止", "言語変更", "閉卓"])(
  "%sの同じDB更新で進行中turnを中断し、完了済みturnと遅延通知を区別する",
  async (operation) => {
    const { staff } = await setupFixture();
    await setVoiceSession(createApiServices(env), device, "tablecast-lifecycle-voice");
    await insertFixture(businessTables.voiceTurns, [
      {
        id: "tablecast-inflight",
        voice_session_id: "tablecast-lifecycle-voice",
        table_session_id: "tablecast-session",
        store_id: "tablecast-store",
        status: "started",
        started_at: 1,
        ended_at: null,
      },
      {
        id: "tablecast-complete",
        voice_session_id: "tablecast-lifecycle-voice",
        table_session_id: "tablecast-session",
        store_id: "tablecast-store",
        status: "completed",
        started_at: 1,
        ended_at: 2,
      },
    ]).run();
    if (operation === "音声停止") await setVoiceSession(createApiServices(env), device, null);
    else if (operation === "言語変更") await changeLocale(createApiServices(env), device, "en");
    else await closeTable(createApiServices(env), staff);
    await finishVoiceTurn(
      createApiServices(env),
      "tablecast-lifecycle-voice",
      "tablecast-inflight",
      "completed",
    );
    const interrupted = await env.TABLECAST_DB.prepare(
      "SELECT status,ended_at FROM voice_turns WHERE id='tablecast-inflight'",
    ).first<{ ended_at: null | number; status: string }>();
    expect(interrupted?.status).toBe("interrupted");
    expect(interrupted?.ended_at).toBeGreaterThan(1);
    expect(
      await env.TABLECAST_DB.prepare(
        "SELECT status,ended_at FROM voice_turns WHERE id='tablecast-complete'",
      ).first(),
    ).toEqual({ status: "completed", ended_at: 2 });
  },
);

it("遅延した旧音声停止は新しい会話を維持し、別卓のRoomを指定した停止を拒否する", async () => {
  await setupFixture();
  await setVoiceSession(createApiServices(env), device, "tablecast-old-voice");
  await setVoiceSession(createApiServices(env), device, null);
  await setVoiceSession(createApiServices(env), device, "tablecast-new-voice");

  const response = await stop("tablecast-old-voice");
  expect(response.status).toBe(200);
  expect(tableStateSchema.parse(await response.json()).voiceState).toBe("active");
  expect((await stop("tablecast-other-table-voice")).status).toBe(404);
  expect((await stop("tablecast-new-voice")).status).toBe(200);
  expect((await getTableState(createApiServices(env), device)).voiceState).toBe("stopped");
});

it("音声確認を作成した後の新しいturnだけが読了通知なしで承認できる", async () => {
  await setupFixture();
  await setVoiceSession(createApiServices(env), device, "tablecast-voice-session");
  await insertFixture(businessTables.voiceTurns, {
    id: "tablecast-first",
    voice_session_id: "tablecast-voice-session",
    table_session_id: "tablecast-session",
    store_id: "tablecast-store",
    status: "started",
    started_at: Date.now(),
  }).run();
  await env.TABLECAST_DB.prepare(
    "UPDATE table_sessions SET active_turn_id='tablecast-first' WHERE id='tablecast-session'",
  ).run();
  const first = {
    ...device,
    kind: "voice" as const,
    voiceSessionId: "tablecast-voice-session",
    turnId: "tablecast-first",
  };
  await updateCart(createApiServices(env), first, { expectedVersion: 0, lines: tea });
  const snapshot = await prepareConfirmation(createApiServices(env), first, {
    expectedVersion: 1,
    channel: "voice",
  });
  const input = {
    snapshotId: snapshot.id,
    idempotencyKey: "tablecast-spoken-order",
    approved: true as const,
  };
  await expect(submitOrder(createApiServices(env), first, input)).rejects.toMatchObject({
    code: "NEW_APPROVAL_TURN_REQUIRED",
  });
  await env.TABLECAST_DB.prepare(
    "INSERT INTO voice_turns(id,voice_session_id,table_session_id,store_id,status,started_at) SELECT 'tablecast-approval','tablecast-voice-session','tablecast-session','tablecast-store','started',created_at+1 FROM confirmations WHERE id=?",
  )
    .bind(snapshot.id)
    .run();
  await env.TABLECAST_DB.prepare(
    "UPDATE table_sessions SET active_turn_id='tablecast-approval' WHERE id='tablecast-session'",
  ).run();
  const order = await submitOrder(
    createApiServices(env),
    { ...first, turnId: "tablecast-approval" },
    input,
  );
  expect(order.total).toBe(800);
});
