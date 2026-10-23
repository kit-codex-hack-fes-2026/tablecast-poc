import { expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { z } from "zod";
import { credentials } from "./support/runtime";
import { signInStaff } from "./support/session";
import { test } from "./support/test";

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
  await signInStaff(page.request, baseURL);
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
  expect(
    (
      await page.request.post("/api/auth/sign-out", { headers: { Origin: baseURL }, data: {} })
    ).ok(),
  ).toBe(true);
  expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
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
  const organisationDocument = page.url();
  // 店舗選択のCookie更新で認証handlerが自動転送する。旧documentのボタン表示とは区別する。
  // 自動転送後は元responseのbodyが破棄されるため、転送先documentの読込を観測する。
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.origin === new URL(baseURL).origin &&
        url.pathname === "/consent" &&
        url.href !== organisationDocument &&
        url.searchParams.get("client_id") === client.client_id &&
        url.searchParams.get("state") === "tablecast-browser-oauth",
      { waitUntil: "domcontentloaded" },
    ),
    page.getByRole("button", { name: "続ける", exact: true }).click(),
  ]);
  const allow = page.getByRole("main").getByRole("button", { name: "接続を許可", exact: true });
  await expect(allow).toBeEnabled();
  await Promise.all([
    page.waitForURL(
      (url) =>
        url.origin === new URL(callback).origin &&
        url.pathname === new URL(callback).pathname &&
        !!url.searchParams.get("code"),
      { waitUntil: "domcontentloaded" },
    ),
    allow.click(),
  ]);
  const result = new URL(page.url());
  expect(result.origin).toBe(new URL(callback).origin);
  expect(result.pathname).toBe(new URL(callback).pathname);
  expect(result.searchParams.has("error")).toBe(false);
  expect(result.searchParams.get("state")).toBe("tablecast-browser-oauth");
  expect(result.searchParams.get("code")).toBeTruthy();
  await expect(page).toHaveTitle("TableCast OAuth callback");
});
