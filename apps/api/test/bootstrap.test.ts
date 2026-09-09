import { fixtureDb } from "./database-fixture";
import * as authTables from "../src/db/auth-schema";
import { env, exports } from "cloudflare:workers";
import { expect, it, vi } from "vitest";
import { z } from "zod";
import { createAuth } from "../src/auth";
import {
  bootstrapDatabase,
  bootstrapInputSchema,
  type BootstrapEnv,
  type BootstrapInput,
} from "../src/bootstrap";
import { DomainError } from "../src/errors";
import { configurationSchema } from "../src/schema";
import { configuration, setupFixture } from "./fixture";

const bootstrapEnv: BootstrapEnv = {
  TABLECAST_DB: env.TABLECAST_DB,
  TABLECAST_AUTH_SECRET: env.TABLECAST_AUTH_SECRET,
  TABLECAST_PUBLIC_ORIGIN: env.TABLECAST_PUBLIC_ORIGIN,
  TABLECAST_ENV: "staging",
};
function input(): BootstrapInput {
  return {
    admin: {
      name: "初期管理者",
      email: "tablecast-bootstrap@example.test",
      password: "tablecast-bootstrap-private-password",
      locale: "en",
    },
    organization: { name: "初期運営組織", slug: "tablecast-bootstrap-org" },
    store: {
      id: "tablecast-bootstrap-store",
      name: "初期店舗",
      configuration: structuredClone(configuration),
    },
    tables: [
      { id: "tablecast-bootstrap-table-01", name: "01" },
      { id: "tablecast-bootstrap-table-02", name: "02" },
    ],
  };
}
async function counts() {
  return env.TABLECAST_DB.prepare(
    "SELECT (SELECT count(*) FROM user) users,(SELECT count(*) FROM organization) organizations,(SELECT count(*) FROM member) members,(SELECT count(*) FROM team) teams,(SELECT count(*) FROM team_member) teamMembers,(SELECT count(*) FROM stores) stores,(SELECT count(*) FROM config_releases) releases,(SELECT count(*) FROM restaurant_tables) tables",
  ).first();
}
async function failure(operation: Promise<unknown>) {
  try {
    await operation;
  } catch (error) {
    if (error instanceof DomainError) return error;
    throw error;
  }
  throw new Error("登録が拒否されませんでした。");
}

it("新規登録すると公式認証の所有者を持つ店舗・初期公開版・空卓を作成する", async () => {
  const existing = await setupFixture();
  const initial = input();
  initial.admin.email = initial.admin.email.toUpperCase();
  const result = await bootstrapDatabase(bootstrapEnv, initial);
  expect(result).toMatchObject({
    storeId: initial.store.id,
    tableIds: initial.tables.map((table) => table.id),
    configVersion: 1,
  });
  const scope = await env.TABLECAST_DB.prepare(
    "SELECT s.organization_id,m.role,m.user_id,u.locale,u.email FROM stores s JOIN member m ON m.organization_id=s.organization_id JOIN user u ON u.id=m.user_id WHERE s.id=?",
  )
    .bind(result.storeId)
    .first();
  expect(scope).toEqual({
    organization_id: result.organizationId,
    role: "owner",
    user_id: result.userId,
    locale: "en",
    email: initial.admin.email.toLowerCase(),
  });
  const release = await env.TABLECAST_DB.prepare(
    "SELECT config_json,published_by FROM config_releases WHERE store_id=? AND version=1",
  )
    .bind(result.storeId)
    .first<{ config_json: string; published_by: string }>();
  expect(release?.published_by).toBe(result.userId);
  expect(configurationSchema.parse(JSON.parse(release?.config_json ?? "null"))).toEqual(
    initial.store.configuration,
  );
  expect(
    await env.TABLECAST_DB.prepare("SELECT count(*) count FROM table_sessions WHERE store_id=?")
      .bind(result.storeId)
      .first("count"),
  ).toBe(0);
  await fixtureDb.update(authTables.user).set({ emailVerified: true });
  const login = await createAuth(bootstrapEnv).api.signInEmail({
    body: { email: initial.admin.email.toLowerCase(), password: initial.admin.password },
    asResponse: true,
  });
  expect(login.status).toBe(200);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const request = (storeId: string, sessionCookie: string) =>
    exports.default.fetch(
      new Request(`${env.TABLECAST_PUBLIC_ORIGIN}/api/admin/stores/${storeId}`, {
        headers: { Cookie: sessionCookie },
      }),
    );
  expect((await request(result.storeId, cookie)).status).toBe(200);
  expect((await request("tablecast-store", cookie)).status).toBe(403);
  expect((await request(result.storeId, existing.cookie)).status).toBe(403);
});

it("成功後に入力を変えて再実行しても既存設定・所有者・認証情報を上書きしない", async () => {
  const initial = input();
  const result = await bootstrapDatabase(bootstrapEnv, initial);
  const before = await counts();
  const changed = input();
  changed.admin.password = "tablecast-different-private-password";
  changed.admin.locale = "ja";
  changed.store.configuration.cast.proactive = true;
  expect(await failure(bootstrapDatabase(bootstrapEnv, changed))).toMatchObject({
    code: "BOOTSTRAP_CONFLICT",
    status: 409,
    details: { stage: "preflight", userId: null, organizationId: null },
  });
  expect(await counts()).toEqual(before);
  const stored = await env.TABLECAST_DB.prepare("SELECT config_json FROM stores WHERE id=?")
    .bind(result.storeId)
    .first<string>("config_json");
  expect(configurationSchema.parse(JSON.parse(stored ?? "null"))).toEqual(
    initial.store.configuration,
  );
  await fixtureDb.update(authTables.user).set({ emailVerified: true });
  const login = await createAuth(bootstrapEnv).api.signInEmail({
    body: { email: initial.admin.email, password: initial.admin.password },
  });
  expect(login.user.id).toBe(result.userId);
  expect(login.user.locale).toBe("en");
});

it.each([
  {
    name: "大小文字だけ違う既存メール",
    change: (value: BootstrapInput) => {
      value.admin.email = "TABLECAST-STAFF@EXAMPLE.TEST";
    },
  },
  {
    name: "既存組織slug",
    change: (value: BootstrapInput) => {
      value.organization.slug = "tablecast-test";
    },
  },
  {
    name: "既存店舗ID",
    change: (value: BootstrapInput) => {
      value.store.id = "tablecast-store";
    },
  },
  {
    name: "別店舗の卓ID",
    change: (value: BootstrapInput) => {
      value.tables.push({ id: "tablecast-table", name: "既存卓" });
    },
  },
])("$name と競合する場合は新規認証資源も作らず既存tenantを維持する", async ({ change }) => {
  await setupFixture();
  const before = await counts();
  const initial = input();
  change(initial);
  expect(await failure(bootstrapDatabase(bootstrapEnv, initial))).toMatchObject({
    code: "BOOTSTRAP_CONFLICT",
    status: 409,
  });
  expect(await counts()).toEqual(before);
  expect(
    await env.TABLECAST_DB.prepare(
      "SELECT organization_id FROM stores WHERE id='tablecast-store'",
    ).first("organization_id"),
  ).toBe("tablecast-org");
});

it.each([
  {
    name: "初期音声ID",
    change: (value: BootstrapInput) => {
      value.store.configuration.cast.voice.ja = "tablecast-unverified-voice";
    },
  },
  {
    name: "存在しないcategory参照",
    change: (value: BootstrapInput) => {
      const product = value.store.configuration.products[0];
      if (product) product.categoryId = "missing";
    },
  },
  {
    name: "卓ID重複",
    change: (value: BootstrapInput) => {
      value.tables.push({ id: "tablecast-bootstrap-table-01", name: "重複" });
    },
  },
  {
    name: "空の卓一覧",
    change: (value: BootstrapInput) => {
      value.tables = [];
    },
  },
  {
    name: "短いpassword",
    change: (value: BootstrapInput) => {
      value.admin.password = "short";
    },
  },
])("$name は共通入力検証で認証資源の作成前に拒否する", async ({ change }) => {
  const initial = input();
  change(initial);
  const before = await counts();
  expect(bootstrapInputSchema.safeParse(initial).success).toBe(false);
  expect(await failure(bootstrapDatabase(bootstrapEnv, initial))).toMatchObject({
    code: "BOOTSTRAP_INVALID",
    status: 422,
  });
  expect(await counts()).toEqual(before);
});

it("開発環境への管理bootstrapは認証資源を作る前に拒否する", async () => {
  const before = await counts();
  expect(
    await failure(bootstrapDatabase({ ...bootstrapEnv, TABLECAST_ENV: "development" }, input())),
  ).toMatchObject({ code: "BOOTSTRAP_ENV_INVALID", status: 422 });
  expect(await counts()).toEqual(before);
});

it("同じ入力の同時実行は一方だけが成功し所有者と店舗を重複作成しない", async () => {
  const results = await Promise.allSettled([
    bootstrapDatabase(bootstrapEnv, input()),
    bootstrapDatabase(bootstrapEnv, input()),
  ]);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  expect(await counts()).toEqual({
    users: 1,
    organizations: 1,
    members: 1,
    teams: 0,
    teamMembers: 0,
    stores: 1,
    releases: 1,
    tables: 2,
  });
});

it("異なる新規管理者が同じ店舗IDを取り合っても成功側のtenantと初期公開版を変更しない", async () => {
  const second = input();
  second.admin.email = "tablecast-bootstrap-second@example.test";
  second.organization.slug = "tablecast-bootstrap-second-org";
  second.store.configuration.cast.proactive = true;
  const results = await Promise.allSettled([
    bootstrapDatabase(bootstrapEnv, input()),
    bootstrapDatabase(bootstrapEnv, second),
  ]);
  const successes = results.filter((result) => result.status === "fulfilled");
  expect(successes).toHaveLength(1);
  const winner = successes[0]?.value;
  expect(winner).toBeDefined();
  const stored = await env.TABLECAST_DB.prepare(
    "SELECT s.organization_id,r.published_by FROM stores s JOIN config_releases r ON r.store_id=s.id WHERE s.id=?",
  )
    .bind(second.store.id)
    .first();
  expect(stored).toEqual({ organization_id: winner?.organizationId, published_by: winner?.userId });
  expect(
    await env.TABLECAST_DB.prepare("SELECT count(*) count FROM config_releases WHERE store_id=?")
      .bind(second.store.id)
      .first("count"),
  ).toBe(1);
  expect(
    await env.TABLECAST_DB.prepare("SELECT count(*) count FROM member WHERE organization_id=?")
      .bind(winner?.organizationId ?? "")
      .first("count"),
  ).toBe(1);
});

it("組織作成途中の失敗は固定診断だけを返し残存資源を再採用しない", async () => {
  await env.TABLECAST_DB.prepare(
    "CREATE TRIGGER tablecast_bootstrap_team_failure BEFORE INSERT ON organization BEGIN SELECT RAISE(ABORT,'tablecast-private-database-cause'); END",
  ).run();
  const errorLog = vi.spyOn(console, "error");
  const warnLog = vi.spyOn(console, "warn");
  try {
    const error = await failure(bootstrapDatabase(bootstrapEnv, input()));
    expect(error).toMatchObject({
      code: "BOOTSTRAP_FAILED",
      status: 503,
      details: {
        stage: "organization",
        organizationId: null,
      },
    });
    const details = z.object({ userId: z.string().min(1) }).parse(error.details);
    expect(
      await env.TABLECAST_DB.prepare("SELECT id FROM user WHERE id=?")
        .bind(details.userId)
        .first("id"),
    ).toBe(details.userId);
    expect(JSON.stringify(error)).not.toMatch(
      /private-database-cause|private-password|AUTH_SECRET|@example/,
    );
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).not.toHaveBeenCalled();
    const before = await counts();
    expect(before).toMatchObject({ users: 1, stores: 0, releases: 0, tables: 0 });
    expect(await failure(bootstrapDatabase(bootstrapEnv, input()))).toMatchObject({
      code: "BOOTSTRAP_CONFLICT",
      status: 409,
    });
    expect(await counts()).toEqual(before);
  } finally {
    errorLog.mockRestore();
    warnLog.mockRestore();
  }
});

it("卓の途中登録が失敗すると店舗・初期公開版・先行卓が全てrollbackし認証資源だけを報告する", async () => {
  await env.TABLECAST_DB.prepare(
    "CREATE TRIGGER tablecast_bootstrap_table_failure BEFORE INSERT ON restaurant_tables WHEN NEW.id='tablecast-bootstrap-table-02' BEGIN SELECT RAISE(ABORT,'tablecast-private-table-cause'); END",
  ).run();
  const error = await failure(bootstrapDatabase(bootstrapEnv, input()));
  expect(error).toMatchObject({
    code: "BOOTSTRAP_FAILED",
    status: 503,
    details: { stage: "store" },
  });
  const details = z
    .object({ userId: z.string(), organizationId: z.string(), role: z.string().optional() })
    .parse(error.details);
  const owner = await env.TABLECAST_DB.prepare(
    "SELECT user_id,organization_id FROM member WHERE organization_id=?",
  )
    .bind(details.organizationId)
    .first();
  expect(owner).toEqual({
    user_id: details.userId,
    organization_id: details.organizationId,
  });
  expect(JSON.stringify(error)).not.toMatch(
    /private-table-cause|private-password|AUTH_SECRET|@example/,
  );
  const before = await counts();
  expect(before).toEqual({
    users: 1,
    organizations: 1,
    members: 1,
    teams: 0,
    teamMembers: 0,
    stores: 0,
    releases: 0,
    tables: 0,
  });
  expect(await failure(bootstrapDatabase(bootstrapEnv, input()))).toMatchObject({
    code: "BOOTSTRAP_CONFLICT",
    status: 409,
  });
  expect(await counts()).toEqual(before);
});
