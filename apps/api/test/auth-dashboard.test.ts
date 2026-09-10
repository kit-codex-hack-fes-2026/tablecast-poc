import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { afterEach, expect, inject, test, vi } from "vitest";
import app from "../src/app";
import { session, user } from "../src/db/auth-schema";
import { fixtureDb } from "./database-fixture";
import { setupFixture } from "./fixture";

const origin = "http://localhost:3000";
const configured = {
  ...env,
  TABLECAST_ENV: "production",
  TABLECAST_BETTER_AUTH_API_KEY: "tablecast-dashboard-test-key",
};

afterEach(() => vi.restoreAllMocks());

test("利用者とセッションがある旧schemaへ列追加migrationを適用すると、既存データを保持する", async () => {
  await setupFixture();
  const users = await fixtureDb.select().from(user);
  const sessions = await fixtureDb.select().from(session);
  // Given: fixtureの認証データを保ったまま、列追加前のschemaへ戻す
  await fixtureDb.run(sql`ALTER TABLE user DROP COLUMN last_active_at`);
  const migration = inject("tablecastMigrations").find(
    (entry) => entry.name === "0012_tablecast_auth_activity.sql",
  );
  expect(migration).toBeDefined();

  // When: 実際に配備するmigrationを実D1へ適用する
  for (const query of migration?.queries ?? []) await fixtureDb.run(sql.raw(query));

  // Then: 最終利用日時はNULLで、ユーザーと既存セッションの全項目を保持する
  expect(await fixtureDb.select().from(user)).toEqual(users);
  expect(await fixtureDb.select().from(session)).toEqual(sessions);
});

test.each([200, 503])(
  "DashboardがHTTP %sを返す本番でログインすると、応答後に最終利用日時を保存する",
  async (status) => {
    // Given: 移行後の既存ユーザーとセッションには最終利用日時がない
    const { staff } = await setupFixture();
    const previousSessions = await fixtureDb.select().from(session);
    expect(await fixtureDb.select({ lastActiveAt: user.lastActiveAt }).from(user).get()).toEqual({
      lastActiveAt: null,
    });
    const outbound = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json({ success: status === 200 }, { status }));
    const context = createExecutionContext();
    const waitUntil = vi.spyOn(context, "waitUntil");
    const startedAt = Date.now();

    // When: 本番のHono経路でメールログインする
    const response = await app.fetch(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({
          email: "tablecast-staff@example.test",
          password: "tablecast-local-fixture-password",
        }),
      }),
      configured,
      context,
    );
    await waitOnExecutionContext(context);

    // Then: 外部送信の成否によらずログインでき、既存セッションを保持して日時を更新する
    expect(response.status).toBe(200);
    expect(response.headers.getSetCookie().join(";")).toContain("tablecast.session_token");
    expect(waitUntil).toHaveBeenCalled();
    const updated = await fixtureDb
      .select({ lastActiveAt: user.lastActiveAt })
      .from(user)
      .where(eq(user.id, staff.userId))
      .get();
    expect(updated?.lastActiveAt?.getTime()).toBeGreaterThanOrEqual(startedAt);
    expect(await fixtureDb.select().from(session)).toEqual(
      expect.arrayContaining(previousSessions),
    );
    const requests = outbound.mock.calls.map(([input, init]) => new Request(input, init));
    const events = requests.filter(
      (request) => request.url === "https://dash.better-auth.com/events/track",
    );
    expect(events.length).toBeGreaterThan(0);
    expect(await Promise.all(events.map((request) => request.json()))).toEqual(
      expect.arrayContaining([expect.objectContaining({ eventType: "user_signed_in" })]),
    );
  },
);

test.each([
  { environment: "preview", key: "tablecast-dashboard-test-key" },
  { environment: "development", key: "tablecast-dashboard-test-key" },
  { environment: "production", key: "" },
])(
  "$environmentで鍵が$keyの場合、Dashboardを公開せず最終利用日時と外部送信を更新しない",
  async ({ environment, key }) => {
    const { cookie } = await setupFixture();
    const outbound = vi.spyOn(globalThis, "fetch");
    const context = createExecutionContext();
    const settings = {
      ...env,
      TABLECAST_ENV: environment,
      TABLECAST_BETTER_AUTH_API_KEY: key,
    };

    const response = await app.fetch(
      new Request(`${origin}/api/auth/update-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie },
        body: JSON.stringify({ name: "更新後の店員" }),
      }),
      settings,
      context,
    );
    const dashboard = await app.fetch(
      new Request(`${origin}/api/auth/dash/list-users`),
      settings,
      context,
    );
    await waitOnExecutionContext(context);

    expect(response.status).toBe(200);
    expect(dashboard.status).toBe(404);
    expect(await fixtureDb.select({ lastActiveAt: user.lastActiveAt }).from(user).get()).toEqual({
      lastActiveAt: null,
    });
    expect(outbound).not.toHaveBeenCalled();
  },
);

test("本番Dashboardへ署名なしで要求すると、認証データを返さず拒否する", async () => {
  const context = createExecutionContext();
  const response = await app.fetch(
    new Request(`${origin}/api/auth/dash/list-users`),
    configured,
    context,
  );
  await waitOnExecutionContext(context);
  expect(response.status).toBe(401);
});
