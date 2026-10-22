import { env, exports } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { member, passkey, user, verification } from "../src/db/identity-schema";
import { createAuth } from "../src/modules/auth/service";
import { resolveMcpActor } from "../src/modules/mcp/service";
import { createApiServices } from "../src/platform/context";
import { fixtureDb } from "./database-fixture";
import { responseCookies, setupFixture } from "./fixture";

function mailAt<T>(mails: T[], index: number): T {
  const mail = mails[index];
  if (!mail) throw new Error("期待したメールがありません");
  return mail;
}
const origin = "http://localhost:3000";
const mailEnv = {
  ...env,
  TABLECAST_ENV: "development",
  TABLECAST_EMAIL_FROM: "tablecast@example.test",
  TABLECAST_MAILPIT_URL: "http://localhost:8025",
};
afterEach(() => vi.restoreAllMocks());
function captureMail() {
  const mails: { HTML: string; Subject: string; Text: string; To: { Email: string }[] }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    expect(request.url).toBe("http://localhost:8025/api/v1/send");
    mails.push(
      z
        .object({
          HTML: z.string(),
          Text: z.string(),
          Subject: z.string(),
          To: z.array(z.object({ Email: z.string() })),
        })
        .parse(await request.json()),
    );
    return Response.json({ ID: "tablecast-mail" });
  });
  return mails;
}
const post = (auth: ReturnType<typeof createAuth>, path: string, body: unknown, cookie = "") =>
  auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    }),
  );
function loginUrl(html: string) {
  const url = html
    .match(/href="([^"]*\/api\/auth\/magic-link\/verify[^"]+)"/)?.[1]
    ?.replaceAll("&amp;", "&");
  if (!url) throw new Error("ログインリンクが届いていません");
  return url;
}
it("マジックリンクは実D1で一度だけ消費し、パスキー未登録では業務・組織・MCPを拒否する", async () => {
  const mails = captureMail();
  const auth = createAuth(mailEnv);
  await post(auth, "/sign-in/magic-link", {
    email: "new@example.test",
    callbackURL: "/invitations/sample",
  });
  const url = loginUrl(mailAt(mails, 0).HTML);
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
  expect(completed.headers.get("location")).toBe(`${origin}/invitations/sample`);
  const cookie = responseCookies(completed);
  expect(cookie).toContain("tablecast.last_login_method=magic-link");
  const state = await exports.default.fetch(
    new Request(`${origin}/api/account/auth-state`, { headers: { Cookie: cookie } }),
  );
  expect(await state.json()).toMatchObject({
    passkeyRequired: true,
    user: { emailVerified: true },
  });
  const initial = await exports.default.fetch(
    new Request(`${origin}/api/admin/initial?defaultFloor=true`, { headers: { Cookie: cookie } }),
  );
  expect(await initial.json()).toMatchObject({
    session: { passkeyRequired: true },
    stores: [],
    floor: null,
  });
  await post(auth, "/update-user", { passkeyRegistered: true }, cookie);
  const denied = await exports.default.fetch(
    new Request(`${origin}/api/admin/stores`, { headers: { Cookie: cookie } }),
  );
  expect(denied.status).toBe(403);
  expect(await denied.json()).toMatchObject({ error: { code: "PASSKEY_REGISTRATION_REQUIRED" } });
  expect(
    (
      await auth.handler(
        new Request(`${origin}/api/auth/organization/list`, { headers: { Cookie: cookie } }),
      )
    ).status,
  ).toBe(403);
  const authorizePath =
    "/api/auth/oauth2/authorize?client_id=sample&state=a%2Bb&ba_param=first&ba_param=second";
  const onboarding = await auth.handler(
    new Request(origin + authorizePath, { headers: { Cookie: cookie } }),
  );
  expect(onboarding.status).toBe(302);
  const onboardingUrl = new URL(onboarding.headers.get("location") ?? "", origin);
  expect(onboardingUrl.pathname).toBe("/passkey-setup");
  expect(onboardingUrl.searchParams.get("returnTo")).toBe(authorizePath);
  const person = await fixtureDb
    .select()
    .from(user)
    .where(eq(user.email, "new@example.test"))
    .get();
  if (!person) throw new Error("ユーザーがありません");
  await expect(
    resolveMcpActor(createApiServices(env), {
      userId: person.id,
      organizationId: "unrelated",
      canWrite: true,
    }),
  ).rejects.toMatchObject({ code: "PASSKEY_REGISTRATION_REQUIRED", status: 403 });
});
it("期限切れのマジックリンクではセッションを発行せず、再送したリンクでログインできる", async () => {
  const mails = captureMail();
  const auth = createAuth(mailEnv);
  await post(auth, "/sign-in/magic-link", { email: "expired@example.test" });
  await fixtureDb.update(verification).set({ expiresAt: new Date(0) });
  const expired = await auth.handler(new Request(loginUrl(mailAt(mails, 0).HTML)));
  expect(responseCookies(expired)).not.toContain("session_token");
  await post(auth, "/sign-in/magic-link", { email: "expired@example.test" });
  expect(
    responseCookies(await auth.handler(new Request(loginUrl(mailAt(mails, 1).HTML)))),
  ).toContain("session_token");
});
it("パスキーの最後の1件はHTTPと同時DB削除の両方で保持する", async () => {
  const { cookie, staff } = await setupFixture();
  const auth = createAuth(env);
  const denied = await post(
    auth,
    "/passkey/delete-passkey",
    { id: "tablecast-fixture-passkey" },
    cookie,
  );
  expect(denied.status).toBe(403);
  expect(await denied.json()).toMatchObject({ message: "LAST_PASSKEY_REQUIRED" });
  await fixtureDb.insert(passkey).values({
    id: "second",
    userId: staff.userId,
    credentialID: "second-credential",
    publicKey: "fixture",
    counter: 0,
    deviceType: "multiDevice",
    backedUp: true,
  });
  const results = await Promise.allSettled([
    fixtureDb.delete(passkey).where(eq(passkey.id, "second")),
    fixtureDb.delete(passkey).where(eq(passkey.id, "tablecast-fixture-passkey")),
  ]);
  expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  expect(
    await fixtureDb.select().from(passkey).where(eq(passkey.userId, staff.userId)),
  ).toHaveLength(1);
});
it("招待メールに役割・招待者・期限を含め、承諾時に本人と招待者へ通知する", async () => {
  const { cookie } = await setupFixture();
  const mails = captureMail();
  const auth = createAuth(mailEnv);
  const invited = await post(
    auth,
    "/organization/invite-member",
    { email: "invitee@example.test", role: "member", organizationId: "tablecast-org" },
    cookie,
  );
  expect(invited.status).toBe(200);
  const invitation = z.object({ id: z.string() }).parse(await invited.json());
  expect(mailAt(mails, 0).Text).toContain("tablecast-staff@example.test");
  expect(mailAt(mails, 0).Text).toContain("Member");
  expect(mailAt(mails, 0).Text).toContain("Expires");
  await post(auth, "/sign-in/magic-link", { email: "invitee@example.test" });
  const signedIn = await auth.handler(new Request(loginUrl(mailAt(mails, 1).HTML)));
  const inviteeCookie = responseCookies(signedIn);
  const person = await fixtureDb
    .select()
    .from(user)
    .where(eq(user.email, "invitee@example.test"))
    .get();
  if (!person) throw new Error("ユーザーがありません");
  await fixtureDb.insert(passkey).values({
    id: "invitee-key",
    userId: person.id,
    credentialID: "invitee-credential",
    publicKey: "fixture",
    counter: 0,
    deviceType: "multiDevice",
    backedUp: true,
  });
  const accepted = await post(
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
  const mails = captureMail();
  const auth = createAuth(mailEnv);
  const account = await (
    await auth.$context
  ).internalAdapter.createAccount({
    providerId: "google",
    accountId: "notification-google-subject",
    userId: staff.userId,
  });
  expect(mailAt(mails, 0).Subject).toContain("Google");
  expect((await post(auth, "/unlink-account", { accountId: account.id }, cookie)).status).toBe(200);
  expect(mailAt(mails, 1).Subject).toContain("解除");
  await fixtureDb.insert(passkey).values({
    id: "notification-second",
    userId: staff.userId,
    credentialID: "notification-second",
    publicKey: "fixture",
    counter: 0,
    deviceType: "multiDevice",
    backedUp: true,
  });
  const removed = await post(
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
  expect((await post(auth, "/unlink-account", { accountId: retryAccount.id }, cookie)).status).toBe(
    200,
  );
});

it("招待の辞退は招待者だけへ通知し、取消後のリンクは参加できない", async () => {
  const { cookie, staff } = await setupFixture();
  const mails = captureMail();
  const auth = createAuth(mailEnv);
  // 招待者が別店舗のownerである前提を作る。
  await fixtureDb.insert(member).values({
    id: "other-owner",
    organizationId: "tablecast-fixture-other-org",
    userId: staff.userId,
    role: "owner",
    createdAt: new Date(),
  });
  const sent = await post(
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
  await post(auth, "/sign-in/magic-link", { email: "decline@example.test" });
  const signedIn = await auth.handler(new Request(loginUrl(mailAt(mails, 1).HTML)));
  const person = await fixtureDb
    .select()
    .from(user)
    .where(eq(user.email, "decline@example.test"))
    .get();
  if (!person) throw new Error("招待先ユーザーがありません");
  await fixtureDb.insert(passkey).values({
    id: "decline-key",
    userId: person.id,
    credentialID: "decline-key",
    publicKey: "fixture",
    counter: 0,
    deviceType: "multiDevice",
    backedUp: true,
  });
  const rejected = await post(
    auth,
    "/organization/reject-invitation",
    { invitationId: invitation.id },
    responseCookies(signedIn),
  );
  expect(rejected.status).toBe(200);
  expect(mailAt(mails, 2).To.map((item) => item.Email)).toEqual(["tablecast-staff@example.test"]);
  const newInvite = await post(
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
    (await post(auth, "/organization/cancel-invitation", { invitationId: renewed.id }, cookie))
      .status,
  ).toBe(200);
  expect(mailAt(mails, 4).To.map((item) => item.Email)).toEqual(["decline@example.test"]);
  expect(
    (
      await post(
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
      new Request(`${origin}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: {
          Origin: origin,
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
