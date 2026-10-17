import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import { account, user } from "../src/db/auth-schema";
import { createAuth } from "../src/modules/auth/service";
import { fixtureDb } from "./database-fixture";

afterEach(() => vi.restoreAllMocks());
const cookies = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");

it("実認証の確認メールとGoogle往復は同じユーザーへ接続し、providerを重複させない", async () => {
  const origin = "http://localhost:3000";
  const email = "tablecast-linking@example.test";
  const password = "tablecast-linking-verification-password";
  const mails: { HTML: string; Text: string }[] = [];
  const userinfoHeaders: (string | null)[] = [];
  // メール配送とIdPの外側だけを固定し、token・state・Cookie・D1は実認証を通す。
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.url === "http://localhost:8025/api/v1/send") {
      mails.push(z.object({ HTML: z.string(), Text: z.string() }).parse(await request.json()));
      return Response.json({ ID: "tablecast-verification-mail" });
    }
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
    ...env,
    TABLECAST_ENV: "development",
    TABLECAST_EMAIL_FROM: "tablecast@example.test",
    TABLECAST_MAILPIT_URL: "http://localhost:8025",
    TABLECAST_GOOGLE_EMULATOR_URL: "http://tablecast-google.localhost",
  });
  const post = (path: string, body: unknown, cookie = "") =>
    auth.handler(
      new Request(origin + path, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(body),
      }),
    );
  const signup = await post("/api/auth/sign-up/email", {
    email,
    password,
    name: "連携会員",
    callbackURL: "/account",
  });
  expect(signup.status).toBe(200);
  expect(cookies(signup)).not.toContain("session_token");
  expect((await post("/api/auth/sign-in/email", { email, password })).status).toBe(403);
  const verification = mails[0];
  expect(verification).toBeDefined();
  expect(verification?.HTML).toContain(`src="${origin}/brand/tablecast-logo.png"`);
  expect(verification?.HTML).toContain('alt="TableCast"');
  expect(verification?.Text).toMatch(/^TableCast\n/);
  const href = verification?.HTML.match(
    /href="([^"]*\/api\/auth\/verify-email[^"]+)"/u,
  )?.[1]?.replaceAll("&amp;", "&");
  expect(href).toBeTruthy();
  if (!href) throw new Error("確認メールのURLがありません");
  const verified = await auth.handler(new Request(href));
  expect(verified.status).toBe(302);
  const login = await post("/api/auth/sign-in/email", { email, password });
  expect(login.status).toBe(200);
  const session = z.object({ user: z.object({ id: z.string(), emailVerified: z.boolean() }) });
  const passwordSession = session.parse(
    await (
      await auth.handler(
        new Request(`${origin}/api/auth/get-session`, { headers: { Cookie: cookies(login) } }),
      )
    ).json(),
  );
  expect(passwordSession.user.emailVerified).toBe(true);
  expect((await post("/api/auth/sign-out", {}, cookies(login))).status).toBe(200);
  for (let attempt = 0; attempt < 2; attempt++) {
    const social = await post("/api/auth/sign-in/social", {
      provider: "google",
      callbackURL: "/organisations",
    });
    expect(social.status).toBe(200);
    const destination = new URL(z.object({ url: z.string() }).parse(await social.json()).url);
    const callback = new URL(destination.searchParams.get("redirect_uri") ?? "");
    callback.searchParams.set("state", destination.searchParams.get("state") ?? "");
    callback.searchParams.set("code", `tablecast-code-${attempt}`);
    const returned = await auth.handler(
      new Request(callback, { headers: { Cookie: cookies(social) } }),
    );
    expect(returned.status).toBe(302);
    expect(new URL(returned.headers.get("location") ?? "", origin).href).toBe(
      `${origin}/organisations`,
    );
    const googleSession = session.parse(
      await (
        await auth.handler(
          new Request(`${origin}/api/auth/get-session`, { headers: { Cookie: cookies(returned) } }),
        )
      ).json(),
    );
    expect(googleSession.user.id).toBe(passwordSession.user.id);
  }
  expect(await fixtureDb.select().from(user).where(eq(user.email, email))).toHaveLength(1);
  const links = await fixtureDb
    .select()
    .from(account)
    .where(eq(account.userId, passwordSession.user.id));
  expect(links.filter((link) => link.providerId === "google")).toHaveLength(1);
  expect(links.filter((link) => link.providerId === "credential")).toHaveLength(1);
  expect(userinfoHeaders).toEqual(["Bearer tablecast-idp-token", "Bearer tablecast-idp-token"]);
});
