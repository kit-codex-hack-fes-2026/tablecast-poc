import { applyD1Migrations } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import { expect, it, inject } from "vitest";
import { setupFixture } from "./fixture";
it("店舗作成は所有者・空メニュー・指定卓を同時に作り、同一店舗の組織を重複させない", async () => {
  // Given: ログイン済みの店長。
  const { cookie, staff } = await setupFixture();
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/api/admin/stores", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "新店舗", slug: "tablecast-new", tableCount: 3 }),
    }),
  );
  // When: 店舗名と卓数だけで登録する。
  expect(response.status).toBe(201);
  const created = await env.TABLECAST_DB.prepare(
    "SELECT s.id,s.organization_id,m.user_id,m.role,s.config_json FROM stores s JOIN organization o ON o.id=s.organization_id JOIN member m ON m.organization_id=o.id WHERE o.slug='tablecast-new'",
  ).first<{
    id: string;
    organization_id: string;
    user_id: string;
    role: string;
    config_json: string;
  }>();
  expect(created).toMatchObject({ user_id: staff.userId, role: "owner" });
  if (!created) throw new Error("店舗がありません。");
  // Then: 架空の商品を追加せず、所属と卓の境界をDBで保持する。
  expect(JSON.parse(created.config_json)).toMatchObject({ products: [], categories: [] });
  expect(
    await env.TABLECAST_DB.prepare("SELECT COUNT(*) count FROM restaurant_tables WHERE store_id=?")
      .bind(created.id)
      .first("count"),
  ).toBe(3);
  await expect(
    env.TABLECAST_DB.prepare(
      "INSERT INTO stores(id,organization_id,name,config_json,updated_at) SELECT 'tablecast-duplicate',organization_id,name,config_json,updated_at FROM stores WHERE id=?",
    )
      .bind(created.id)
      .run(),
  ).rejects.toThrow(/UNIQUE/);
});
it("旧複数店舗の移行は店員の担当とカートを維持して組織を店舗ごとに分割する", async () => {
  // Given: 旧形式で二店舗を運営し、一般店員は二店舗目だけを担当する。
  const { staff } = await setupFixture();
  await env.TABLECAST_DB.prepare("DROP INDEX stores_organization_id_unique").run();
  await env.TABLECAST_DB.batch([
    env.TABLECAST_DB.prepare(
      "INSERT INTO team(id,name,organization_id,created_at) VALUES('tablecast-old-team','担当店','tablecast-org',0)",
    ),
    env.TABLECAST_DB.prepare(
      "INSERT INTO stores(id,organization_id,team_id,name,config_json,updated_at) SELECT 'tablecast-z-store',organization_id,'tablecast-old-team','二号店',config_json,updated_at FROM stores WHERE id='tablecast-store'",
    ),
    env.TABLECAST_DB.prepare("UPDATE member SET role='member' WHERE user_id=?").bind(staff.userId),
    env.TABLECAST_DB.prepare(
      "INSERT INTO team_member(id,team_id,user_id,created_at) VALUES('tablecast-old-membership','tablecast-old-team',?,0)",
    ).bind(staff.userId),
  ]);
  const before = await env.TABLECAST_DB.prepare(
    "SELECT id,cart_json,cart_version FROM table_sessions",
  ).all();
  const migration = inject("tablecastMigrations").find((item) =>
    item.name.includes("0011_tablecast_store_membership"),
  );
  if (!migration) throw new Error("店舗移行がありません。");
  await env.TABLECAST_DB.prepare("DELETE FROM d1_migrations WHERE name=?")
    .bind(migration.name)
    .run();
  // When: 本番と同じD1 migrationを適用する。
  await applyD1Migrations(env.TABLECAST_DB, [migration]);
  // Then: 二店舗目への所属だけを引き継ぎ、既存の注文カートを変えない。
  const memberships = await env.TABLECAST_DB.prepare(
    "SELECT s.id FROM stores s JOIN member m ON m.organization_id=s.organization_id WHERE m.user_id=?",
  )
    .bind(staff.userId)
    .all();
  expect(memberships.results).toEqual([{ id: "tablecast-z-store" }]);
  expect(
    await env.TABLECAST_DB.prepare("SELECT id,cart_json,cart_version FROM table_sessions").all(),
  ).toMatchObject({ results: before.results });
  expect((await env.TABLECAST_DB.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});

it("店舗を伴わない組織だけの作成を拒否する", async () => {
  // Given: ログイン済みの店長。
  const { cookie } = await setupFixture();
  // When: Better Authの組織単独作成URLを直接呼ぶ。
  const response = await exports.default.fetch(
    new Request("http://localhost:3000/api/auth/organization/create", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "店舗なし", slug: "tablecast-orphan" }),
    }),
  );
  // Then: 店舗と所属を同時に作成する業務APIだけを許可する。
  expect(response.status).toBe(403);
  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT id FROM organization WHERE slug='tablecast-orphan'",
    ).first(),
  ).toBeNull();
});
