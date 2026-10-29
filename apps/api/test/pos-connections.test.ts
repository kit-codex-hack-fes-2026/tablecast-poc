import { eq } from "drizzle-orm";
import { afterEach, assert, expect, it, vi } from "vitest";
import { posConnections, posOauthStates } from "../src/db/pos-schema";
import { finishPosOAuth, savePosSettings } from "../src/modules/pos/connections";
import { connectedAdapter, posStateHash, readPosCredentials } from "../src/modules/pos/credentials";
import { createApiServices } from "../src/platform/context";
import { fixtureDb } from "./database-fixture";
import { setupFixture } from "./fixture";
import { base, configured, deviceId, mappings, posConnection, request } from "./pos-fixture";

afterEach(() => vi.restoreAllMocks());

async function setupConnection() {
  const fixture = await setupFixture();
  await posConnection(fixture.staff.userId);
  const connection = await fixtureDb.select().from(posConnections).get();
  assert(connection);
  return { ...fixture, connection, services: createApiServices(configured()) };
}
async function authorizationIntent(userId: string) {
  const state = crypto.randomUUID();
  await fixtureDb.insert(posOauthStates).values({
    hash: await posStateHash(state),
    mode: "test",
    userId,
    storeId: "tablecast-store",
    expiresAt: Date.now() + 300_000,
  });
  return state;
}
function oauthHttp(handler: (outbound: Request) => Promise<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const outbound = new Request(input, init);
    if (new URL(outbound.url).origin !== "https://connect.squareupsandbox.com")
      throw new Error("Sandbox以外の外部要求は許可しません");
    return handler(outbound);
  });
}
function token(accessToken = "new-square-token", merchantId = "square-merchant") {
  return Response.json({
    access_token: accessToken,
    refresh_token: "new-square-refresh",
    merchant_id: merchantId,
    expires_at: new Date(Date.now() + 30 * 86400_000).toISOString(),
  });
}

it("切断claim後に古いrefreshが成功しても接続を復活させず、新操作を止める", async () => {
  const { cookie, connection, services } = await setupConnection();
  await fixtureDb
    .update(posConnections)
    .set({ expiresAt: 1 })
    .where(eq(posConnections.id, connection.id));
  const refreshEntered = Promise.withResolvers<void>(),
    refreshRelease = Promise.withResolvers<void>();
  const revokeEntered = Promise.withResolvers<void>(),
    revokeRelease = Promise.withResolvers<void>();
  oauthHttp(async (outbound) => {
    if (new URL(outbound.url).pathname === "/oauth2/token") {
      refreshEntered.resolve();
      await refreshRelease.promise;
      return token();
    }
    revokeEntered.resolve();
    await revokeRelease.promise;
    return Response.json({ success: true });
  });
  const refreshing = connectedAdapter(services, connection).catch((error: unknown) => error);
  await refreshEntered.promise;
  const disconnecting = request(`${base}/pos`, cookie, "DELETE");
  try {
    await revokeEntered.promise;
    const claimed = await fixtureDb.select().from(posConnections).get();
    expect(claimed).toMatchObject({
      status: "disconnecting",
      revision: 2,
      credentials: connection.credentials,
    });
    await expect(connectedAdapter(services, connection)).rejects.toMatchObject({
      code: "POS_CONNECTION_REQUIRED",
    });
    expect((await request(`${base}/pos/oauth`, cookie, "POST")).status).toBe(422);
    expect(
      (
        await request(`${base}/pos`, cookie, "PUT", {
          expectedRevision: 1,
          locationId: "square-location",
          deviceId,
          mappings,
        })
      ).status,
    ).toBe(422);
    refreshRelease.resolve();
    expect(await refreshing).toMatchObject({ code: "POS_CONNECTION_REQUIRED" });
    expect((await fixtureDb.select().from(posConnections).get())?.status).toBe("disconnecting");
  } finally {
    refreshRelease.resolve();
    revokeRelease.resolve();
  }
  expect((await disconnecting).status).toBe(200);
  expect(await fixtureDb.select().from(posConnections).get()).toMatchObject({
    status: "disconnected",
    credentials: "",
    expiresAt: 0,
  });
});

it("旧refreshの認証失敗は並行OAuthで保存した新tokenを再認証要求へ戻さない", async () => {
  const { staff, connection, services } = await setupConnection();
  await fixtureDb
    .update(posConnections)
    .set({ expiresAt: 1 })
    .where(eq(posConnections.id, connection.id));
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  const state = await authorizationIntent(staff.userId);
  oauthHttp(async (outbound) => {
    const body: unknown = await outbound.json();
    if (
      body &&
      typeof body === "object" &&
      "grant_type" in body &&
      body.grant_type === "refresh_token"
    ) {
      entered.resolve();
      await release.promise;
      return Response.json(
        { errors: [{ code: "UNAUTHORIZED", category: "AUTHENTICATION_ERROR" }] },
        { status: 401 },
      );
    }
    return token("reauthorized-token");
  });
  const refreshing = connectedAdapter(services, connection).catch((error: unknown) => error);
  try {
    await entered.promise;
    await finishPosOAuth(services, staff.userId, state, "new-auth-code");
  } finally {
    release.resolve();
  }
  expect(await refreshing).toMatchObject({ code: "POS_AUTH_REQUIRED" });
  const current = await fixtureDb.select().from(posConnections).get();
  assert(current);
  expect(current).toMatchObject({ status: "connected", revision: 2 });
  expect(await readPosCredentials(configured(), current.id, current.credentials)).toMatchObject({
    accessToken: "reauthorized-token",
  });
});

it("OAuth交換中に切断が始まった場合は旧callbackの後着を拒否する", async () => {
  const { cookie, staff, connection, services } = await setupConnection();
  const state = await authorizationIntent(staff.userId);
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  const revokeEntered = Promise.withResolvers<void>(),
    revokeRelease = Promise.withResolvers<void>();
  oauthHttp(async (outbound) => {
    if (new URL(outbound.url).pathname === "/oauth2/token") {
      entered.resolve();
      await release.promise;
      return token("late-token");
    }
    revokeEntered.resolve();
    await revokeRelease.promise;
    return Response.json({ success: true });
  });
  const finishing = finishPosOAuth(services, staff.userId, state, "auth-code").catch(
    (error: unknown) => error,
  );
  await entered.promise;
  const disconnecting = request(`${base}/pos`, cookie, "DELETE");
  try {
    await revokeEntered.promise;
    release.resolve();
    expect(await finishing).toMatchObject({ code: "POS_CONNECTION_CONFLICT" });
    expect(await fixtureDb.select().from(posConnections).get()).toMatchObject({
      status: "disconnecting",
      credentials: connection.credentials,
    });
    const secondState = await authorizationIntent(staff.userId);
    await expect(
      finishPosOAuth(services, staff.userId, secondState, "second-code"),
    ).rejects.toMatchObject({ code: "POS_CONNECTION_REQUIRED" });
  } finally {
    release.resolve();
    revokeRelease.resolve();
  }
  expect((await disconnecting).status).toBe(200);
  expect((await fixtureDb.select().from(posConnections).get())?.credentials).toBe("");
});

it("revokeの応答喪失や未確認の拒否では秘密を保持し、DELETE再試行の成功確認後だけ消す", async () => {
  const { cookie, connection } = await setupConnection();
  let requests = 0;
  const outgoing = oauthHttp(async () => {
    requests += 1;
    if (requests === 1) throw new Error("revoke送信後の応答喪失");
    if (requests === 2)
      return Response.json(
        { errors: [{ code: "NOT_FOUND", category: "INVALID_REQUEST_ERROR" }] },
        { status: 404 },
      );
    return Response.json({ success: true });
  });
  expect((await request(`${base}/pos`, cookie, "DELETE")).status).toBe(503);
  expect(await fixtureDb.select().from(posConnections).get()).toMatchObject({
    status: "disconnecting",
    credentials: connection.credentials,
  });
  expect((await request(`${base}/pos`, cookie, "DELETE")).status).toBe(422);
  expect((await fixtureDb.select().from(posConnections).get())?.status).toBe("disconnecting");
  expect((await request(`${base}/pos`, cookie, "DELETE")).status).toBe(200);
  expect(await fixtureDb.select().from(posConnections).get()).toMatchObject({
    status: "disconnected",
    credentials: "",
    expiresAt: 0,
    revision: 2,
  });
  expect(outgoing).toHaveBeenCalledTimes(3);
});

it("別merchantへのOAuth交換は既存接続を上書きしない", async () => {
  const { staff, connection, services } = await setupConnection();
  const state = await authorizationIntent(staff.userId);
  oauthHttp(async () => token("other-token", "other-merchant"));
  await expect(
    finishPosOAuth(services, staff.userId, state, "other-auth-code"),
  ).rejects.toMatchObject({ code: "POS_CONNECTION_CONFLICT" });
  expect(await fixtureDb.select().from(posConnections).get()).toEqual(connection);
});

it("遅い重複DELETEの完了は新OAuth資格を消さず、旧access tokenだけを失効する", async () => {
  const { cookie, staff, services } = await setupConnection();
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  const revokedBodies: unknown[] = [];
  oauthHttp(async (outbound) => {
    if (new URL(outbound.url).pathname === "/oauth2/token") return token("reauthorized-token");
    const body: unknown = await outbound.json();
    revokedBodies.push(body);
    if (revokedBodies.length === 1) {
      entered.resolve();
      await release.promise;
    }
    return Response.json({ success: true });
  });
  const older = request(`${base}/pos`, cookie, "DELETE");
  try {
    await entered.promise;
    expect((await request(`${base}/pos`, cookie, "DELETE")).status).toBe(200);
    const state = await authorizationIntent(staff.userId);
    await finishPosOAuth(services, staff.userId, state, "new-auth-code");
  } finally {
    release.resolve();
  }
  expect((await older).status).toBe(409);
  const current = await fixtureDb.select().from(posConnections).get();
  assert(current);
  expect(current).toMatchObject({ status: "connected", revision: 3 });
  expect(await readPosCredentials(configured(), current.id, current.credentials)).toMatchObject({
    accessToken: "reauthorized-token",
  });
  expect(revokedBodies).toEqual(
    [0, 1].map(() => ({
      client_id: configured().TABLECAST_SQUARE_APPLICATION_ID,
      access_token: "tablecast-square-access-token",
      revoke_only_access_token: true,
    })),
  );
});

it("設定検証中の切断完了を古い設定保存で上書きしない", async () => {
  const { cookie, staff, services } = await setupConnection();
  const entered = Promise.withResolvers<void>(),
    release = Promise.withResolvers<void>();
  oauthHttp(async (outbound) => {
    const path = new URL(outbound.url).pathname;
    if (path === "/v2/locations") {
      entered.resolve();
      await release.promise;
      return Response.json({
        locations: [{ id: "square-location", status: "ACTIVE", currency: "JPY" }],
      });
    }
    if (path === "/v2/catalog/list")
      return Response.json({
        objects: [
          {
            type: "ITEM",
            id: "tea",
            item_data: {
              variations: [
                {
                  type: "ITEM_VARIATION",
                  id: "square-tea",
                  item_variation_data: {
                    item_id: "tea",
                    price_money: { amount: 400, currency: "JPY" },
                  },
                },
              ],
            },
          },
        ],
      });
    return Response.json({ success: true });
  });
  const saving = savePosSettings(services, staff, {
    expectedRevision: 1,
    locationId: "square-location",
    deviceId,
    mappings: [...mappings],
  }).catch((error: unknown) => error);
  try {
    await entered.promise;
    expect((await request(`${base}/pos`, cookie, "DELETE")).status).toBe(200);
  } finally {
    release.resolve();
  }
  expect(await saving).toMatchObject({ code: "POS_VERSION_CONFLICT" });
  expect(await fixtureDb.select().from(posConnections).get()).toMatchObject({
    status: "disconnected",
    revision: 2,
    credentials: "",
  });
});
