import { exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { member, session } from "../src/db/auth-schema";
import { stores } from "../src/db/business-schema";
import { fixtureDb } from "./database-fixture";
import { expect, it } from "vitest";
import { configuration, setupFixture } from "./fixture";

it("初期取得は既存の店舗一覧とフロア状態を同じ認証で返す", async () => {
  const { cookie, staff } = await setupFixture();
  const get = (path: string) =>
    exports.default.fetch(
      new Request(`http://localhost:3000${path}`, { headers: { Cookie: cookie } }),
    );
  const response = await get(`/api/admin/initial?storeId=${staff.storeId}`);
  expect(response.status).toBe(200);
  const initial = await response.json<{
    session: { user: { id: string } };
    stores: unknown;
    floor: unknown;
  }>();
  expect(initial.session.user.id).toBe(staff.userId);
  expect(initial.stores).toEqual(
    (await (await get("/api/admin/stores")).json<{ stores: unknown }>()).stores,
  );
  expect(initial.floor).toEqual(await (await get(`/api/admin/stores/${staff.storeId}`)).json());
});

it("未認証の初期取得は店舗とフロアを返さない", async () => {
  await setupFixture();
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/api/admin/initial?storeId=tablecast-store"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ session: null, stores: [], floor: null, catalog: null });
});

it.each(["", "&view=catalog"])("初期取得でも所属しない店舗は拒否する %s", async (view) => {
  const { cookie } = await setupFixture();
  await fixtureDb.insert(stores).values({
    id: "tablecast-other",
    organization_id: "tablecast-fixture-other-org",
    name: "所属外の店舗",
    config_json: JSON.stringify(configuration),
    updated_at: Date.now(),
  });
  const response = await exports.default.fetch(
    new Request(`http://localhost:3000/api/admin/initial?storeId=tablecast-other${view}`, {
      headers: { Cookie: cookie },
    }),
  );
  expect(response.status).toBe(403);
});

it.each(["", "&view=catalog"])(
  "所属を失ったスタッフは初期取得で店舗データを読めない %s",
  async (view) => {
    const { cookie, staff } = await setupFixture();
    await fixtureDb.delete(member).where(eq(member.userId, staff.userId));
    const response = await exports.default.fetch(
      new Request(`http://localhost:3000/api/admin/initial?storeId=${staff.storeId}${view}`, {
        headers: { Cookie: cookie },
      }),
    );
    expect(response.status).toBe(403);
  },
);

it("セッション更新Cookieを返し、取消後の同じCookieでは商品を返さない", async () => {
  const { cookie, staff } = await setupFixture();
  await fixtureDb
    .update(session)
    .set({
      updatedAt: new Date(Date.now() - 2 * 86_400_000),
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    .where(eq(session.userId, staff.userId));
  const get = () =>
    exports.default.fetch(
      new Request(`http://localhost:3000/api/admin/initial?storeId=${staff.storeId}&view=catalog`, {
        headers: { Cookie: cookie },
      }),
    );
  const refreshed = await get();
  expect(refreshed.status).toBe(200);
  expect(refreshed.headers.getSetCookie().length).toBeGreaterThan(0);
  expect(await refreshed.json()).toMatchObject({ catalog: { storeId: staff.storeId } });
  await fixtureDb.delete(session).where(eq(session.userId, staff.userId));
  const revoked = await get();
  expect(await revoked.json()).toEqual({ session: null, stores: [], floor: null, catalog: null });
});

it("既定フロアの初期取得は所属店舗を選び、セッションだけの初期取得はフロアを読まない", async () => {
  const { cookie, staff } = await setupFixture();
  const get = (query: string) =>
    exports.default.fetch(
      new Request(`http://localhost:3000/api/admin/initial${query}`, {
        headers: { Cookie: cookie },
      }),
    );
  const initial = await (
    await get("?defaultFloor=true")
  ).json<{ floor: { store: { id: string } } }>();
  expect(initial.floor.store.id).toBe(staff.storeId);
  expect(await (await get("")).json()).toMatchObject({ floor: null });
  await fixtureDb.delete(member).where(eq(member.userId, staff.userId));
  expect(await (await get("?defaultFloor=true")).json()).toMatchObject({ stores: [], floor: null });
});
