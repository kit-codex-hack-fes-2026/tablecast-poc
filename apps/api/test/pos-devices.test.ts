import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { member } from "../src/db/identity-schema";
import { posConnections } from "../src/db/pos-schema";
import { fixtureDb } from "./database-fixture";
import {
  base,
  checkoutPath,
  configured,
  request,
  setupPosFixture,
  squareHttp,
} from "./pos-fixture";

afterEach(() => vi.restoreAllMocks());

function liveEnvironment() {
  return {
    ...configured(),
    TABLECAST_SQUARE_APPLICATION_ID: "sq0idp-tablecast-test",
    TABLECAST_SQUARE_APPLICATION_SECRET: "sq0csp-tablecast-test",
    TABLECAST_SQUARE_ENVIRONMENT: "production" as const,
  };
}

it("管理者は接続先の端末を取得し登録コードの作成からペアリング完了を照会できる", async () => {
  const { cookie } = await setupPosFixture();
  await fixtureDb
    .update(posConnections)
    .set({ mode: "live" })
    .where(eq(posConnections.storeId, "tablecast-store"));
  const requests: Request[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const outbound = new Request(input, init);
    const url = new URL(outbound.url);
    expect(url.origin).toBe("https://connect.squareup.com");
    expect(outbound.headers.get("authorization")).toBe("Bearer tablecast-square-access-token");
    requests.push(outbound.clone());
    if (outbound.method === "GET" && url.pathname === "/v2/devices/codes")
      return Response.json({
        device_codes: [
          {
            id: "previous-code",
            status: "PAIRED",
            product_type: "TERMINAL_API",
            location_id: "square-location",
            device_id: "terminal-1",
            name: "レジ",
          },
        ],
      });
    if (outbound.method === "POST" && url.pathname === "/v2/devices/codes")
      return Response.json({
        device_code: {
          id: "new-code",
          code: "ABCDEF",
          status: "UNPAIRED",
          pair_by: "2026-10-29T10:05:00Z",
        },
      });
    if (outbound.method === "GET" && url.pathname === "/v2/devices/codes/new-code")
      return Response.json({
        device_code: {
          id: "new-code",
          code: "ABCDEF",
          status: "PAIRED",
          device_id: "terminal-2",
          pair_by: "2026-10-29T10:05:00Z",
        },
      });
    throw new Error(`未定義の外部要求: ${outbound.method} ${url.pathname}`);
  });

  const devices = await request(
    `${base}/pos/devices?locationId=square-location`,
    cookie,
    "GET",
    undefined,
    liveEnvironment(),
  );
  expect(devices.status).toBe(200);
  expect(await devices.json()).toEqual({
    devices: [{ id: "terminal-1", name: "レジ", locationId: "square-location" }],
    canPair: true,
  });
  const code = await request(
    `${base}/pos/devices`,
    cookie,
    "POST",
    { locationId: "square-location", name: "レジ2", idempotencyKey: "tablecast-pairing-key" },
    liveEnvironment(),
  );
  expect(code.status).toBe(200);
  expect(await code.json()).toMatchObject({
    id: "new-code",
    code: "ABCDEF",
    status: "pending",
    deviceId: null,
  });
  expect(await requests[1]?.json()).toEqual({
    idempotency_key: "tablecast-pairing-key",
    device_code: { location_id: "square-location", name: "レジ2", product_type: "TERMINAL_API" },
  });
  const paired = await request(
    `${base}/pos/devices/new-code`,
    cookie,
    "GET",
    undefined,
    liveEnvironment(),
  );
  expect(paired.status).toBe(200);
  expect(await paired.json()).toMatchObject({ status: "paired", deviceId: "terminal-2" });
});

it("店員権限の端末管理と環境が違う接続を外部送信前に拒否する", async () => {
  const { cookie, staff } = await setupPosFixture();
  const outgoing = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("外部送信は不要"));
  const mismatch = await request(
    `${base}/pos/devices`,
    cookie,
    "GET",
    undefined,
    liveEnvironment(),
  );
  expect(mismatch.status).toBe(409);
  expect(await mismatch.json()).toMatchObject({ error: { code: "POS_ENVIRONMENT_MISMATCH" } });
  const checkout = await request(checkoutPath, cookie, "GET", undefined, liveEnvironment());
  expect(checkout.status).toBe(200);
  expect(await checkout.json()).toMatchObject({
    canStart: false,
    issues: [{ code: "POS_ENVIRONMENT_MISMATCH" }],
  });
  await fixtureDb.update(member).set({ role: "member" }).where(eq(member.userId, staff.userId));
  for (const [path, method, body] of [
    ["/devices", "GET", undefined],
    [
      "/devices",
      "POST",
      { locationId: "square-location", name: "レジ", idempotencyKey: "tablecast-pairing-key" },
    ],
    ["/devices/new-code", "GET", undefined],
  ] as const) {
    const response = await request(`${base}/pos${path}`, cookie, method, body);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: "ADMIN_REQUIRED" } });
  }
  expect(outgoing).not.toHaveBeenCalled();
});

it("進行中の会計がある接続では端末登録コードを追加しない", async () => {
  const { cookie, table } = await setupPosFixture();
  const provider = squareHttp();
  expect(
    (
      await request(`${checkoutPath}/start`, cookie, "POST", {
        expectedVersion: table.cart.version,
        idempotencyKey: "tablecast-device-lock",
      })
    ).status,
  ).toBe(200);
  await fixtureDb
    .update(posConnections)
    .set({ mode: "live" })
    .where(eq(posConnections.storeId, "tablecast-store"));
  const previousRequests = provider.requests.length;
  const response = await request(
    `${base}/pos/devices`,
    cookie,
    "POST",
    { locationId: "square-location", name: "レジ", idempotencyKey: "tablecast-pairing-key" },
    liveEnvironment(),
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "POS_CHECKOUT_LOCKED" } });
  expect(provider.requests).toHaveLength(previousRequests);
});
