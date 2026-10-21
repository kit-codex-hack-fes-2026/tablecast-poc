import {
  createExecutionContext,
  runInDurableObject,
  waitOnExecutionContext,
} from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import app from "../src/app";
import { organizationAi, organizationAiKeys, voiceUsageSessions } from "../src/db/billing-schema";
import {
  pendingOrganizationKey,
  provisionOrganizationKey,
  sealOrganizationKey,
} from "../src/modules/billing/credentials";
import { beginVoiceUsage, voiceBillingAccount } from "../src/modules/billing/usage";
import { createApiServices } from "../src/platform/context";
import { deviceToken, setupFixture } from "./fixture";
const configured = () => ({
  ...env,
  TABLECAST_VOICE_ENABLED: "true",
  TABLECAST_MODEL: "gpt-6-luna",
  TABLECAST_ORGANIZATION_AI_ENABLED: "true",
  TABLECAST_OPENAI_ADMIN_API_KEY: "tablecast-admin-key",
  TABLECAST_OPENAI_PROJECT_ID: "proj_tablecast_test",
  TABLECAST_BILLING_ENABLED: "false",
});
afterEach(() => vi.restoreAllMocks());
async function prepare() {
  await setupFixture();
  const services = createApiServices(configured());
  await pendingOrganizationKey(services, "tablecast-org");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) =>
    Response.json(
      init?.method === "POST"
        ? { id: "acct_tablecast", api_key: { id: "key_tablecast", value: "tablecast-tenant-key" } }
        : { data: [], has_more: false },
    ),
  );
  await provisionOrganizationKey(services, "tablecast-org");
  vi.restoreAllMocks();
  return services;
}
const start = () =>
  new Request("http://localhost:3000/api/table/voice/start", {
    method: "POST",
    headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sdp: "tablecast-offer" }),
  });
it("本番HTTPで音声開始と実DOの計測を接続し、鍵切替後も開始時の鍵で停止する", async () => {
  const services = await prepare();
  const sockets: WebSocket[] = [];
  const headers: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    headers.push(new Headers(init?.headers).get("Authorization") ?? "");
    const url = input instanceof Request ? input.url : String(input);
    if (!url.endsWith("/attach"))
      return Response.json({
        session: { id: "live_tablecast_billing" },
        transport: { type: "webrtc", sdp: "tablecast-answer" },
      });
    const pair = new WebSocketPair();
    pair[1].accept();
    sockets.push(pair[1]);
    pair[1].addEventListener("message", () =>
      pair[1].send(JSON.stringify({ type: "session.closed", usage: { seconds: 90 } })),
    );
    return new Response(null, { status: 101, webSocket: pair[0] });
  });
  const ctx = createExecutionContext();
  const stub = env.TABLECAST_VOICE_USAGE.getByName("live_tablecast_billing");
  try {
    const response = await app.fetch(start(), services.env, ctx);
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/tenant-key|encryptedKey/);
    const sideband = sockets[0];
    if (!sideband) throw new Error("計測用sidebandが必要です");
    await runInDurableObject(stub, () => {
      sideband.send(JSON.stringify({ type: "session.started" }));
      sideband.send(JSON.stringify({ type: "session.usage.updated", usage: { seconds: 30 } }));
    });
    await expect
      .poll(async () => (await services.db.select().from(voiceUsageSessions).get())?.seconds)
      .toBe(30);
    await services.db.batch([
      services.db.insert(organizationAiKeys).values({
        id: "key_rotated",
        organizationId: "tablecast-org",
        projectId: "proj_tablecast_test",
        serviceAccountId: "acct_rotated",
        encryptedKey: await sealOrganizationKey(
          services.env,
          "tablecast-org:key_rotated",
          "tablecast-new-key",
        ),
        createdAt: Date.now(),
      }),
      services.db
        .update(organizationAi)
        .set({ credentialId: "key_rotated" })
        .where(eq(organizationAi.organizationId, "tablecast-org")),
    ]);
    const stopped = await app.fetch(
      new Request("http://localhost:3000/api/table/voice/stop", {
        method: "POST",
        headers: { Cookie: `tablecast.device=${deviceToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ voiceSessionId: "live_tablecast_billing" }),
      }),
      services.env,
      ctx,
    );
    expect(stopped.status).toBe(200);
    expect(headers.every((value) => value === "Bearer tablecast-tenant-key")).toBe(true);
    expect(await services.db.select().from(voiceUsageSessions).get()).toMatchObject({
      final: true,
      seconds: 90,
      credentialId: "key_tablecast",
      measurementFailed: false,
    });
  } finally {
    await runInDurableObject(stub, async (_, state) => {
      sockets[0]?.close(1000);
      await state.storage.deleteAll();
    });
    sockets[1]?.close(1000);
    await waitOnExecutionContext(ctx);
  }
});
it("sideband切断中の利用量を未確定に残し、再接続後の音声確定でも消さない", async () => {
  const services = await prepare();
  const account = await voiceBillingAccount(services, "tablecast-store");
  const sessionId = "live_disconnected";
  await beginVoiceUsage(
    services,
    sessionId,
    "tablecast-store",
    "tablecast-session",
    false,
    account,
  );
  const stub = env.TABLECAST_VOICE_USAGE.getByName(sessionId);
  const peers: WebSocket[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const pair = new WebSocketPair();
    pair[1].accept();
    peers.push(pair[1]);
    return new Response(null, { status: 101, webSocket: pair[0] });
  });
  const usage = () =>
    services.db.select().from(voiceUsageSessions).where(eq(voiceUsageSessions.id, sessionId)).get();
  try {
    await stub.start(sessionId);
    await runInDurableObject(stub, () => {
      peers[0]?.send(JSON.stringify({ type: "session.started" }));
      peers[0]?.close(1011, "TableCast test connection lost");
    });
    await expect.poll(async () => (await usage())?.measurementFailed).toBe(true);
    // この切断中に完了したResponsesは観測できず、音声の累積秒だけでは補完できない。
    await runInDurableObject(stub, (instance) => instance.alarm());
    expect(peers).toHaveLength(2);
    await runInDurableObject(stub, () =>
      peers[1]?.send(JSON.stringify({ type: "session.closed", usage: { seconds: 90 } })),
    );
    await expect.poll(async () => (await usage())?.final).toBe(true);
    expect(await usage()).toMatchObject({ seconds: 90, measurementFailed: true });
  } finally {
    await runInDurableObject(stub, async (_, state) => {
      for (const peer of peers) peer.close(1000);
      await state.storage.deleteAll();
      await state.storage.deleteAlarm();
    });
  }
});
it("キーの準備前と未契約のAI開始を拒否し、管理GUIのAPIは利用できる", async () => {
  const { cookie } = await setupFixture();
  const provider = vi.spyOn(globalThis, "fetch");
  const ctx = createExecutionContext();
  const response = await app.fetch(start(), configured(), ctx);
  expect(response.status).toBe(503);
  expect(await response.text()).toContain("ORGANIZATION_AI_NOT_READY");
  await waitOnExecutionContext(ctx);
  expect(provider).not.toHaveBeenCalled();
  expect(
    (
      await app.fetch(
        new Request("http://localhost:3000/api/admin/stores", { headers: { Cookie: cookie } }),
        configured(),
      )
    ).status,
  ).toBe(200);
});

it("計測できないモデル料金を0円で確定せず、実DOが停止要求と未確定状態を残す", async () => {
  const services = await prepare();
  const account = await voiceBillingAccount(services, "tablecast-store");
  await beginVoiceUsage(
    services,
    "live_unpriced",
    "tablecast-store",
    "tablecast-session",
    false,
    account,
  );
  const stub = env.TABLECAST_VOICE_USAGE.getByName("live_unpriced");
  let peer: undefined | WebSocket;
  let closeRequested = false;
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    const pair = new WebSocketPair();
    peer = pair[1];
    peer.accept();
    peer.addEventListener("message", () => {
      closeRequested = true;
    });
    return new Response(null, { status: 101, webSocket: pair[0] });
  });
  try {
    await stub.start("live_unpriced");
    await runInDurableObject(stub, () =>
      peer?.send(
        JSON.stringify({
          type: "response.event",
          event: {
            type: "response.completed",
            response: {
              id: "resp_unpriced",
              model: "unpriced-model",
              service_tier: "default",
              usage: { input_tokens: 1000, output_tokens: 1 },
            },
          },
        }),
      ),
    );
    await expect
      .poll(
        async () =>
          (
            await services.db
              .select()
              .from(voiceUsageSessions)
              .where(eq(voiceUsageSessions.id, "live_unpriced"))
              .get()
          )?.measurementFailed,
      )
      .toBe(true);
    expect(closeRequested).toBe(true);
  } finally {
    await runInDurableObject(stub, async (_, state) => {
      peer?.close(1000);
      await state.storage.deleteAll();
    });
  }
});
