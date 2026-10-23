import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { member, organization, passkey, user, verification } from "../src/db/identity-schema";
import { createAuth } from "../src/modules/auth/service";
import { resolveMcpActor } from "../src/modules/mcp/service";
import { createApiServices } from "../src/platform/context";
import { authOrigin, authPost, captureAuthMail, magicLinkUrl, mailAuthEnv } from "./auth-fixture";
import { fixtureDb } from "./database-fixture";
import { addFixturePasskey, responseCookies, setupFixture } from "./fixture";

function mailAt<T>(mails: T[], index: number): T {
  const mail = mails[index];
  if (!mail) throw new Error("期待したメールがありません");
  return mail;
}
afterEach(() => vi.restoreAllMocks());
it("マジックリンクは実D1で一度だけ消費し、パスキー未登録でもログインでき、所属のない店舗にはアクセスできない", async () => {
  const { mails } = captureAuthMail();
  const auth = createAuth(mailAuthEnv);
  await authPost(auth, "/sign-in/magic-link", {
    email: "new@example.test",
    callbackURL: "/invitations/sample",
  });
  const url = magicLinkUrl(mails[0]);
  const token = new URL(url).searchParams.get("token");
  expect(JSON.stringify(await fixtureDb.select().from(verification))).not.toContain(token);
  const results = await Promise.all([
    auth.handler(new Request(url)),
    auth.handler(new Request(url)),
  ]);
  const success = results.filter((result) => responseCookies(result).includes("session_token"));
  expect(success).toHaveLength(1);
  const [completed] = success;
  if (!completed) throw new Error("セッションがありません");
  expect(completed.headers.get("location")).toBe(`${authOrigin}/invitations/sample`);
  const cookie = responseCookies(completed);
  expect(cookie).toContain("tablecast.last_login_method=magic-link");
  const state = await exports.default.fetch(
    new Request(`${authOrigin}/api/account/auth-state`, { headers: { Cookie: cookie } }),
  );
  expect(await state.json()).toMatchObject({
    user: { emailVerified: true, passkeyRegistered: false },
  });
  const initial = await exports.default.fetch(
    new Request(`${authOrigin}/api/admin/initial?defaultFloor=true`, {
      headers: { Cookie: cookie },
    }),
  );
  expect(await initial.json()).toMatchObject({
    session: { user: { passkeyRegistered: false } },
    stores: [],
    floor: null,
  });
  await authPost(auth, "/update-user", { passkeyRegistered: true }, cookie);
  const permitted = await exports.default.fetch(
    new Request(`${authOrigin}/api/admin/stores`, { headers: { Cookie: cookie } }),
  );
  expect(permitted.status).toBe(200);
  expect(await permitted.json()).toMatchObject({ stores: [] });
  expect(
    (
      await auth.handler(
        new Request(`${authOrigin}/api/auth/organization/list`, { headers: { Cookie: cookie } }),
      )
    ).status,
  ).toBe(200);
  const person = await fixtureDb
    .select()
    .from(user)
    .where(eq(user.email, "new@example.test"))
    .get();
  if (!person) throw new Error("ユーザーがありません");
  expect(person.passkeyRegistered).toBe(false);
  await expect(
    resolveMcpActor(createApiServices(env), {
      userId: person.id,
      organizationId: "unrelated",
      canWrite: true,
    }),
  ).rejects.toMatchObject({ code: "STORE_FORBIDDEN", status: 403 });
});
it("期限切れのマジックリンクではセッションを発行せず、再送したリンクでログインできる", async () => {
  const { mails } = captureAuthMail();
  const auth = createAuth(mailAuthEnv);
  await authPost(auth, "/sign-in/magic-link", { email: "expired@example.test" });
  await fixtureDb.update(verification).set({ expiresAt: new Date(0) });
  const expired = await auth.handler(new Request(magicLinkUrl(mails[0])));
  expect(responseCookies(expired)).not.toContain("session_token");
  await authPost(auth, "/sign-in/magic-link", { email: "expired@example.test" });
  expect(responseCookies(await auth.handler(new Request(magicLinkUrl(mails[1]))))).toContain(
    "session_token",
  );
});
it("最後のパスキーも削除でき、未登録の所属ユーザーは業務・MCPを利用できる", async () => {
  const { cookie, staff } = await setupFixture();
  await addFixturePasskey(staff.userId);
  const auth = createAuth(env);
  const removed = await authPost(
    auth,
    "/passkey/delete-passkey",
    { id: "tablecast-fixture-passkey" },
    cookie,
  );
  expect(removed.status).toBe(200);
  expect(
    await fixtureDb.select().from(passkey).where(eq(passkey.userId, staff.userId)),
  ).toHaveLength(0);
  expect(await fixtureDb.select().from(user).where(eq(user.id, staff.userId)).get()).toMatchObject({
    passkeyRegistered: false,
  });
  const stores = await exports.default.fetch(
    new Request(`${authOrigin}/api/admin/stores`, { headers: { Cookie: cookie } }),
  );
  expect(stores.status).toBe(200);
  expect(await stores.json()).toMatchObject({ stores: [{ id: "tablecast-store", role: "owner" }] });
  await expect(
    resolveMcpActor(createApiServices(env), {
      userId: staff.userId,
      organizationId: "tablecast-org",
      canWrite: true,
    }),
  ).resolves.toMatchObject({ storeId: "tablecast-store", role: "owner" });
  await addFixturePasskey(staff.userId, "first");
  await addFixturePasskey(staff.userId, "second");
  await Promise.all([
    fixtureDb.delete(passkey).where(eq(passkey.id, "first")),
    fixtureDb.delete(passkey).where(eq(passkey.id, "second")),
  ]);
  expect(await fixtureDb.select().from(user).where(eq(user.id, staff.userId)).get()).toMatchObject({
    passkeyRegistered: false,
  });
});
it("招待メールに役割・招待者・期限を含め、承諾時に本人と招待者へ通知する", async () => {
  const { cookie, staff } = await setupFixture();
  await fixtureDb
    .update(user)
    .set({ image: "/api/avatars/11111111-1111-4111-8111-111111111111" })
    .where(eq(user.id, staff.userId));
  await fixtureDb
    .update(organization)
    .set({ logo: "https://example.test/store.png" })
    .where(eq(organization.id, "tablecast-org"));
  const { mails } = captureAuthMail();
  const auth = createAuth(mailAuthEnv);
  const invited = await authPost(
    auth,
    "/organization/invite-member",
    { email: "invitee@example.test", role: "member", organizationId: "tablecast-org" },
    cookie,
  );
  expect(invited.status).toBe(200);
  const invitation = z.object({ id: z.string() }).parse(await invited.json());
  expect(mailAt(mails, 0).Text).toContain("tablecast-staff@example.test");
  expect(mailAt(mails, 0).Text).toContain("Member");
  expect(mailAt(mails, 0).Text).toContain("スタッフ");
  expect(mailAt(mails, 0).HTML).toContain("/email/user-round-badge.png");
  expect(mailAt(mails, 0).Text).toContain("Expires");
  expect(mailAt(mails, 0).HTML).toContain('src="https://example.test/store.png"');
  expect(mailAt(mails, 0).HTML).toContain(
    `src="${authOrigin}/api/avatars/11111111-1111-4111-8111-111111111111"`,
  );
  expect(mailAt(mails, 0).HTML).toContain('lang="ja"');
  expect(mailAt(mails, 0).HTML).toContain('lang="en"');
  expect(mailAt(mails, 0).Text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  await authPost(auth, "/sign-in/magic-link", { email: "invitee@example.test" });
  const signedIn = await auth.handler(new Request(magicLinkUrl(mails[1])));
  const inviteeCookie = responseCookies(signedIn);
  const accepted = await authPost(
    auth,
    "/organization/accept-invitation",
    { invitationId: invitation.id },
    inviteeCookie,
  );
  expect(accepted.status).toBe(200);
  expect(
    mails
      .slice(2)
      .flatMap((mail) => mail.To.map((recipient) => recipient.Email))
      .toSorted(),
  ).toEqual(["invitee@example.test", "tablecast-staff@example.test"]);
});

it("パスキー削除とGoogle連携の通知は実際の変更時だけ送り、配送失敗でも変更を維持する", async () => {
  const { cookie, staff } = await setupFixture();
  const { mails } = captureAuthMail();
  const auth = createAuth(mailAuthEnv);
  const account = await (
    await auth.$context
  ).internalAdapter.createAccount({
    providerId: "google",
    accountId: "notification-google-subject",
    userId: staff.userId,
  });
  expect(mailAt(mails, 0).Subject).toContain("Google");
  expect((await authPost(auth, "/unlink-account", { accountId: account.id }, cookie)).status).toBe(
    200,
  );
  expect(mailAt(mails, 1).Subject).toContain("解除");
  await addFixturePasskey(staff.userId, "notification-second");
  const removed = await authPost(
    auth,
    "/passkey/delete-passkey",
    { id: "notification-second" },
    cookie,
  );
  expect(removed.status).toBe(200);
  expect(mailAt(mails, 2).Subject).toContain("削除");
  vi.mocked(globalThis.fetch).mockResolvedValue(Response.json({}, { status: 503 }));
  const retryAccount = await (
    await auth.$context
  ).internalAdapter.createAccount({
    providerId: "google",
    accountId: "notification-google-retry",
    userId: staff.userId,
  });
  expect(
    (await authPost(auth, "/unlink-account", { accountId: retryAccount.id }, cookie)).status,
  ).toBe(200);
});

it("招待の辞退は招待者だけへ通知し、取消後のリンクは参加できない", async () => {
  const { cookie, staff } = await setupFixture();
  const { mails } = captureAuthMail();
  const auth = createAuth(mailAuthEnv);
  // 招待者が別店舗のownerである前提を作る。
  await fixtureDb.insert(member).values({
    id: "other-owner",
    organizationId: "tablecast-fixture-other-org",
    userId: staff.userId,
    role: "owner",
    createdAt: new Date(),
  });
  const sent = await authPost(
    auth,
    "/organization/invite-member",
    {
      email: "decline@example.test",
      role: "member",
      organizationId: "tablecast-fixture-other-org",
    },
    cookie,
  );
  const invitation = z.object({ id: z.string() }).parse(await sent.json());
  await authPost(auth, "/sign-in/magic-link", { email: "decline@example.test" });
  const signedIn = await auth.handler(new Request(magicLinkUrl(mails[1])));
  const rejected = await authPost(
    auth,
    "/organization/reject-invitation",
    { invitationId: invitation.id },
    responseCookies(signedIn),
  );
  expect(rejected.status).toBe(200);
  expect(mailAt(mails, 2).To.map((item) => item.Email)).toEqual(["tablecast-staff@example.test"]);
  const newInvite = await authPost(
    auth,
    "/organization/invite-member",
    {
      email: "decline@example.test",
      role: "member",
      organizationId: "tablecast-fixture-other-org",
    },
    cookie,
  );
  const renewed = z.object({ id: z.string() }).parse(await newInvite.json());
  expect(
    (await authPost(auth, "/organization/cancel-invitation", { invitationId: renewed.id }, cookie))
      .status,
  ).toBe(200);
  expect(mailAt(mails, 4).To.map((item) => item.Email)).toEqual(["decline@example.test"]);
  expect(
    (
      await authPost(
        auth,
        "/organization/accept-invitation",
        { invitationId: renewed.id },
        responseCookies(signedIn),
      )
    ).status,
  ).not.toBe(200);
});

it("本番のマジックリンク送信制限は別の認証インスタンス間でもD1で共有する", async () => {
  let delivered = 0;
  const settings = {
    ...env,
    TABLECAST_ENV: "production",
    TABLECAST_EMAIL_FROM: "tablecast@example.test",
    TABLECAST_EMAIL: {
      send: async () => {
        delivered++;
        return { messageId: "tablecast-rate-limit-mail" };
      },
    },
  };
  const statuses: number[] = [];
  for (let attempt = 0; attempt < 6; attempt++) {
    const auth = createAuth(settings);
    const response = await auth.handler(
      new Request(`${authOrigin}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: {
          Origin: authOrigin,
          "Content-Type": "application/json",
          "x-forwarded-for": "192.0.2.38",
          "cf-connecting-ip": "192.0.2.38",
        },
        body: JSON.stringify({ email: "rate@example.test" }),
      }),
    );
    statuses.push(response.status);
  }
  expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  expect(delivered).toBe(5);
});

it.each([
  { selected: "en", saved: "ja", expected: "Sign in to TableCast" },
  { selected: "ja", saved: "en", expected: "TableCastへのログイン" },
  { selected: undefined, saved: "en", expected: "Sign in to TableCast" },
  { selected: "invalid", saved: "en", expected: "Sign in to TableCast" },
] as const)(
  "マジックリンクの言語は画面指定$selected・保存済み$savedから選び、設定を書き換えない",
  async ({ selected, saved, expected }) => {
    const { staff } = await setupFixture();
    await fixtureDb.update(user).set({ locale: saved }).where(eq(user.id, staff.userId));
    const { mails } = captureAuthMail();
    const response = await authPost(createAuth(mailAuthEnv), "/sign-in/magic-link", {
      email: "tablecast-staff@example.test",
      metadata: { locale: selected },
    });
    expect(response.status).toBe(200);
    expect(mailAt(mails, 0).Subject).toBe(expected);
    expect(mailAt(mails, 0).HTML).toContain(`lang="${expected.startsWith("Sign") ? "en" : "ja"}"`);
    expect(
      (
        await fixtureDb
          .select({ locale: user.locale })
          .from(user)
          .where(eq(user.id, staff.userId))
          .get()
      )?.locale,
    ).toBe(saved);
  },
);
it("新規ユーザーへ選択言語のリンクを送り、確認メールも保存済み言語を使う", async () => {
  const { mails } = captureAuthMail();
  const auth = createAuth(mailAuthEnv);
  await authPost(auth, "/sign-in/magic-link", {
    email: "new-english@example.test",
    metadata: { locale: "en" },
  });
  expect(mailAt(mails, 0).Subject).toBe("Sign in to TableCast");
  const { staff } = await setupFixture();
  await fixtureDb
    .update(user)
    .set({ locale: "en", emailVerified: false })
    .where(eq(user.id, staff.userId));
  const response = await authPost(auth, "/send-verification-email", {
    email: "tablecast-staff@example.test",
  });
  expect(response.status).toBe(200);
  expect(mailAt(mails, 1).Subject).toBe("Verify your email");
});

it("マジックリンクと招待の配送失敗を成功として返さない", async () => {
  const { cookie } = await setupFixture();
  const { outbound } = captureAuthMail();
  outbound.mockResolvedValue(Response.json({}, { status: 503 }));
  const auth = createAuth(mailAuthEnv);
  await expect(
    authPost(auth, "/sign-in/magic-link", {
      email: "delivery@example.test",
      metadata: { locale: "en" },
    }),
  ).rejects.toThrow("EMAIL_DELIVERY_FAILED");
  await expect(
    authPost(
      auth,
      "/organization/invite-member",
      { email: "delivery@example.test", role: "member", organizationId: "tablecast-org" },
      cookie,
    ),
  ).rejects.toThrow("EMAIL_DELIVERY_FAILED");
});
