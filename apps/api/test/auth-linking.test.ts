import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { account, user } from "../src/db/identity-schema";
import { createAuth } from "../src/modules/auth/service";
import { authOrigin, authPost, captureAuthMail, magicLinkUrl, mailAuthEnv } from "./auth-fixture";
import { fixtureDb } from "./database-fixture";
import { responseCookies } from "./fixture";

afterEach(() => vi.restoreAllMocks());

it("実認証の確認メールとGoogle往復は同じユーザーへ接続し、providerを重複させない", async () => {
  const email = "tablecast-linking@example.test";
  const userinfoHeaders: (null | string)[] = [];
  // メール配送とIdPの外側だけを固定し、token・state・Cookie・D1は実認証を通す。
  const { mails } = captureAuthMail((request) => {
    if (request.url === "http://tablecast-google.localhost/oauth2/token")
      return Response.json({
        access_token: "tablecast-idp-token",
        token_type: "Bearer",
        expires_in: 3600,
      });
    if (request.url === "http://tablecast-google.localhost/oauth2/v2/userinfo") {
      userinfoHeaders.push(request.headers.get("authorization"));
      return Response.json({
        sub: "tablecast-google-subject",
        email,
        email_verified: true,
        name: "連携会員",
      });
    }
    throw new Error(`未定義の外部要求: ${request.url}`);
  });
  const auth = createAuth({
    ...mailAuthEnv,
    TABLECAST_GOOGLE_EMULATOR_URL: "http://tablecast-google.localhost",
  });
  const signup = await authPost(auth, "/sign-in/magic-link", {
    email,
    name: "連携会員",
    callbackURL: "/account",
  });
  expect(signup.status).toBe(200);
  expect(responseCookies(signup)).not.toContain("session_token");
  const verification = mails[0];
  expect(verification?.HTML).toContain(`src="${authOrigin}/brand/tablecast-logo.png"`);
  expect(verification?.Text).toMatch(/^TableCast\n/);
  const login = await auth.handler(new Request(magicLinkUrl(verification)));
  expect(login.status).toBe(302);
  const session = z.object({ user: z.object({ id: z.string(), emailVerified: z.boolean() }) });
  const emailSession = session.parse(
    await (
      await auth.handler(
        new Request(`${authOrigin}/api/auth/get-session`, {
          headers: { Cookie: responseCookies(login) },
        }),
      )
    ).json(),
  );
  expect(emailSession.user.emailVerified).toBe(true);
  expect((await authPost(auth, "/sign-out", {}, responseCookies(login))).status).toBe(200);
  for (let attempt = 0; attempt < 2; attempt++) {
    const social = await authPost(auth, "/sign-in/social", {
      provider: "google",
      callbackURL: "/organisations",
    });
    expect(social.status).toBe(200);
    const destination = new URL(z.object({ url: z.string() }).parse(await social.json()).url);
    const callback = new URL(destination.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("state", destination.searchParams.get("state") ?? "");
    callback.searchParams.set("code", `tablecast-code-${attempt}`);
    const returned = await auth.handler(
      new Request(callback, { headers: { Cookie: responseCookies(social) } }),
    );
    expect(returned.status).toBe(302);
    expect(new URL(returned.headers.get("location") ?? "", authOrigin).href).toBe(
      `${authOrigin}/organisations`,
    );
    const googleSession = session.parse(
      await (
        await auth.handler(
          new Request(`${authOrigin}/api/auth/get-session`, {
            headers: { Cookie: responseCookies(returned) },
          }),
        )
      ).json(),
    );
    expect(googleSession.user.id).toBe(emailSession.user.id);
  }
  expect(await fixtureDb.select().from(user).where(eq(user.email, email))).toHaveLength(1);
  const links = await fixtureDb
    .select()
    .from(account)
    .where(eq(account.userId, emailSession.user.id));
  expect(links.filter((link) => link.providerId === "google")).toHaveLength(1);
  expect(links.filter((link) => link.providerId === "credential")).toHaveLength(0);
  expect(userinfoHeaders).toEqual(["Bearer tablecast-idp-token", "Bearer tablecast-idp-token"]);
});
