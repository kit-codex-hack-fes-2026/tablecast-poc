import { expect, type APIRequestContext } from "@playwright/test";
import { credentials } from "./runtime";

// 認証がGivenの試験だけで使う。ログイン画面・OAuthそのものの試験は公開操作を本体へ残す。
export async function signInStaff(request: APIRequestContext, origin: string | undefined) {
  if (!origin) throw new Error("runtime fixtureの専用originが必要です。");
  const response = await request.post("/api/auth/sign-in/email", {
    headers: { Origin: origin },
    data: { email: credentials.email, password: credentials.password },
  });
  expect(response.status(), "専用fixtureのスタッフで認証する").toBe(200);
}
