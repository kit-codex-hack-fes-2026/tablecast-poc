import { exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { member } from "../src/db/auth-schema";
import { fixtureDb } from "./database-fixture";
import { expect, it } from "vitest";
import { setupFixture } from "./fixture";

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
  expect(await response.json()).toEqual({ session: null, stores: [], floor: null });
});

it("初期取得でも所属しない店舗は拒否する", async () => {
  const { cookie } = await setupFixture();
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/api/admin/initial?storeId=tablecast-other", {
      headers: { Cookie: cookie },
    }),
  );
  expect(response.status).toBe(403);
});

it("所属を失ったスタッフは初期取得でフロアを読めない", async () => {
  const { cookie, staff } = await setupFixture();
  await fixtureDb.delete(member).where(eq(member.userId, staff.userId));
  const response = await exports.default.fetch(
    new Request(`http://localhost:3000/api/admin/initial?storeId=${staff.storeId}`, {
      headers: { Cookie: cookie },
    }),
  );
  expect(response.status).toBe(403);
});
