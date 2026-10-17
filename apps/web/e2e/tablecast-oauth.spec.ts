import { test } from "./support/test";
import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { z } from "zod";
import { credentials } from "./support/runtime";

// callbackを差し替えるHTTP境界をSWに迂回させない。
test.use({ trace: "off", serviceWorkers: "block" });

test("MCP接続は実ログインと明示同意を経て外部callbackへ認可コードを返す", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("ローカル公開URLがありません");
  const callback = "http://127.0.0.1:6274/oauth/callback";
  await page.route(`${callback}**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<title>TableCast OAuth callback</title>",
    }),
  );
  const staffSession = await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL },
    data: credentials,
  });
  expect(staffSession.ok(), await staffSession.text()).toBeTruthy();
  const registration = await page.request.post("/api/auth/oauth2/register", {
    headers: { Origin: baseURL },
    data: {
      client_name: "TableCast browser acceptance",
      redirect_uris: [callback],
      scope: "tablecast:read tablecast:write",
      token_endpoint_auth_method: "none",
      application_type: "native",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    },
  });
  expect(registration.ok(), await registration.text()).toBeTruthy();
  const client = z.object({ client_id: z.string() }).parse(await registration.json());
  await page.request.post("/api/auth/sign-out", { headers: { Origin: baseURL }, data: {} });
  const verifier = "tablecast-browser-proof-key-0123456789-abcdefghijklmnopqrstuvwxyz";
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: callback,
    response_type: "code",
    scope: "tablecast:read tablecast:write",
    resource: `${baseURL}/mcp`,
    state: "tablecast-browser-oauth",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  await page.goto(`/api/auth/oauth2/authorize?${query}`);
  await page.getByLabel("メールアドレス").fill(credentials.email);
  await page.getByLabel("パスワード", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "ログイン", exact: true }).click();
  await expect(page).toHaveURL(/\/consent\?/);
  await page.getByRole("button", { name: "続ける", exact: true }).click();
  await expect(page.getByRole("button", { name: "接続を許可", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "English", exact: true }).click();
  await page.getByRole("button", { name: "Allow connection", exact: true }).click();
  await expect(page).toHaveURL(/\/oauth\/callback\?.*code=/);
  const result = new URL(page.url());
  expect(result.searchParams.get("state")).toBe("tablecast-browser-oauth");
  expect(result.searchParams.get("code")).toBeTruthy();
});
