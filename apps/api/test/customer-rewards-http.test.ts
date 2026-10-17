import { env, exports } from "cloudflare:workers";
import { expect, it } from "vitest";
import { z } from "zod";
import { tableStateSchema } from "../src/schema";
import { deviceToken, setupFixture } from "./fixture";

it("会員・店舗の実HTTPから付与・交換・申請・会計適用・取消を実D1へ接続する", async () => {
  const { cookie } = await setupFixture();
  const origin = "http://localhost:3000";
  const admin = "/api/admin/stores/tablecast-store";
  const member = "/api/customer/stores/tablecast-store";
  async function request(path: string, body?: unknown, authCookie = cookie) {
    const response = await exports.default.fetch(
      new Request(origin + path, {
        method: body === undefined ? "GET" : "POST",
        headers: { Cookie: authCookie, Origin: origin, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    expect({ path, status: response.status }).toEqual({ path, status: 200 });
    return response;
  }
  await request(`${admin}/tables/tablecast-session/close`, {});
  await request(`${admin}/points/policy`, {
    expectedVersion: 0,
    enabled: true,
    kind: "visit",
    points: 4,
    unitYen: 100,
  });
  const visit = tableStateSchema.parse(
    await (
      await request(`${admin}/tables/open`, {
        tableId: "tablecast-table",
        guestCount: 2,
        locale: "ja",
      })
    ).json(),
  );
  const imageKey = `tablecast/uploads/${"a".repeat(64)}.webp`;
  const imageSource = { generated: false, description: "店舗の券面" };
  await env.TABLECAST_MEDIA.put(imageKey, new Uint8Array([1]), {
    customMetadata: {
      storeId: "tablecast-store",
      metadata: JSON.stringify({ imageKind: "illustration", imageSource }),
    },
  });
  const ruleId = crypto.randomUUID();
  await request(`${admin}/coupons/rules`, {
    id: ruleId,
    expectedVersion: 0,
    active: true,
    rules: {
      title: { ja: "会員割引", en: "Member discount" },
      description: { ja: "100円引き", en: "JPY 100 off" },
      imageKey,
      imageKind: "illustration",
      imageSource,
      startsAt: Date.now() - 1000,
      endsAt: Date.now() + 86400000,
      minimumYen: 0,
      discountKind: "fixed",
      discountValue: 100,
      maximumYen: 100,
      trigger: "exchange",
      threshold: 3,
    },
  });
  await request(`${member}/enrol`, { consentVersion: 1 });
  const code = z
    .object({ code: z.string() })
    .parse(
      await (
        await request("/api/table/customer-code", {}, `tablecast.device=${deviceToken}`)
      ).json(),
    );
  const joined = await request("/api/customer/visits/join", { code: code.code });
  expect(joined.headers.get("Cache-Control")).toBe("private, no-store");
  const pointsPath = `${admin}/tables/${visit.id}/points`;
  const pointVisit = z
    .object({ expectedVersion: z.number(), participants: z.array(z.object({ id: z.string() })) })
    .parse(await (await request(pointsPath)).json());
  await request(pointsPath, {
    expectedVersion: pointVisit.expectedVersion,
    participantIds: pointVisit.participants.map((person) => person.id),
    idempotencyKey: crypto.randomUUID(),
  });
  const points = () => request(`${member}/points`).then((response) => response.json());
  expect(await points()).toMatchObject({ balance: 4, entries: [{ delta: 4 }] });
  const exchange = await request(`${member}/coupons/exchange`, {
    ruleId,
    idempotencyKey: crypto.randomUUID(),
  });
  const coupon = z.object({ id: z.string() }).parse(await exchange.json());
  expect(await points()).toMatchObject({ balance: 1 });
  await request(`${member}/coupons/${coupon.id}/request`, { sessionId: visit.id });
  await request(`${admin}/tables/${visit.id}/payments`, {
    amount: 1000,
    kind: "adjustment",
    reason: "会計",
    idempotencyKey: crypto.randomUUID(),
  });
  const couponsPath = `${admin}/tables/${visit.id}/coupons`;
  const pending = z
    .object({ expectedVersion: z.number(), requested: z.array(z.object({ id: z.string() })) })
    .parse(await (await request(couponsPath)).json());
  expect(pending.requested.map((item) => item.id)).toEqual([coupon.id]);
  await request(`${couponsPath}/apply`, {
    couponId: coupon.id,
    expectedVersion: pending.expectedVersion,
    idempotencyKey: crypto.randomUUID(),
  });
  const tablePath = `${admin}/tables/${visit.id}`;
  const billed = tableStateSchema.parse(await (await request(tablePath)).json());
  expect(billed.bill.due).toBe(900);
  const applied = z
    .object({ expectedVersion: z.number(), uses: z.array(z.object({ id: z.string() })) })
    .parse(await (await request(couponsPath)).json());
  await request(`${couponsPath}/cancel`, {
    useId: applied.uses[0]?.id,
    expectedVersion: applied.expectedVersion,
    reason: "会計訂正",
    idempotencyKey: crypto.randomUUID(),
  });
  expect(tableStateSchema.parse(await (await request(tablePath)).json()).bill.due).toBe(1000);
  expect(await (await request(`${member}/coupons`)).json()).toMatchObject({
    coupons: [{ id: coupon.id, state: "available" }],
  });
});
