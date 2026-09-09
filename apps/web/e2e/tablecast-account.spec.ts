import { test } from "./support/test";
import { expect, request } from "@playwright/test";
import { z } from "zod";
import { credentials } from "./support/runtime";

test.use({ trace: "off" });

const cleanup: (() => Promise<void>)[] = [];
test.afterEach(async () => {
  const failures: unknown[] = [];
  for (const action of cleanup.splice(0).toReversed()) {
    try {
      await action();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, "認証fixtureの後片付けに失敗しました");
});

test("Googleログインから名前変更・店舗作成・招待メールまで利用できる", async ({
  page,
  baseURL,
  runtime,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.getByRole("button", { name: /tablecast-owner@example.test/ }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await expect(page.getByRole("heading", { name: "店舗", exact: true })).toBeVisible();
  const session = z
    .object({ user: z.object({ id: z.string(), email: z.string(), emailVerified: z.boolean() }) })
    .parse(await (await page.request.get("/api/auth/get-session")).json());
  expect(session.user.emailVerified).toBe(true);
  const owner = await request.newContext({ baseURL });
  expect(
    (
      await owner.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
  cleanup.push(async () => {
    await owner.dispose();
  });
  const profile = z
    .object({ user: z.object({ name: z.string() }) })
    .parse(await (await owner.get("/api/auth/get-session")).json());
  cleanup.push(async () => {
    expect(
      (
        await owner.post("/api/auth/update-user", {
          headers: { Origin: baseURL ?? "" },
          data: { name: profile.user.name },
        })
      ).ok(),
    ).toBe(true);
  });
  await page.goto("/account");
  await page.getByLabel("名前", { exact: true }).fill("TableCast テストオーナー");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("更新しました");
  await page.goto("/organisations");
  const slug = `tablecast-acceptance-${Date.now()}`;
  await page.getByRole("link", { name: "店舗を作成", exact: true }).click();
  await expect(page).toHaveURL(/\/stores\/new$/);
  const storeName = `TableCast 受入試験 ${slug}`;
  await page.getByLabel("店舗名", { exact: true }).fill(storeName);
  await page.getByLabel("識別名").fill(slug);
  await page.getByRole("button", { name: "店舗を作成", exact: true }).click();
  await expect(page).toHaveURL(/\/menu\/products$/);
  await page.getByRole("link", { name: "メンバー", exact: true }).click();
  await expect(
    page.getByRole("table").getByText("tablecast-owner@example.test", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText("tablecast-member@example.test", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "招待", exact: true }).click();
  await page.getByRole("link", { name: "メンバーを招待", exact: true }).click();
  await expect(page).toHaveURL(/\/invitations\/new$/);
  await expect(page.getByRole("heading", { name: "メンバーを招待", exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "メールアドレス", exact: true })
    .fill("tablecast-member@example.test");
  await expect(page.getByRole("textbox", { name: "メールアドレス", exact: true })).toHaveValue(
    "tablecast-member@example.test",
  );
  const sending = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/organization/invite-member") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "招待メールを送信" }).click();
  const invitationId = z.object({ id: z.string() }).parse(await (await sending).json()).id;
  await expect(
    page.getByRole("table").getByText("tablecast-member@example.test", { exact: true }),
  ).toBeVisible();
  const messages = await page.request.get(
    `http://127.0.0.1:${runtime.ports.mailpit}/api/v1/messages`,
  );
  const mail = z
    .object({
      messages: z.array(
        z.object({
          ID: z.string(),
          Subject: z.string(),
          To: z.array(z.object({ Address: z.string() })),
        }),
      ),
    })
    .parse(await messages.json())
    .messages.find(
      (item) =>
        item.Subject.includes("Restaurant invitation") &&
        item.To.some((to) => to.Address === "tablecast-member@example.test"),
    );
  expect(mail).toBeDefined();
  const content = z
    .object({ HTML: z.string() })
    .parse(
      await (
        await page.request.get(
          `http://127.0.0.1:${runtime.ports.mailpit}/api/v1/message/${mail?.ID}`,
        )
      ).json(),
    );
  const invitation = content.HTML.match(/href="([^"]*\/invitations\/[^"?]+)"/u)?.[1];
  expect(invitation).toBe(`${baseURL}/invitations/${invitationId}`);
  await page.context().clearCookies();
  await page.goto(invitation ?? "/organisations");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.getByRole("button", { name: /tablecast-member@example.test/ }).click();
  await page.getByRole("button", { name: "参加する", exact: true }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await expect(page.getByRole("heading", { name: "店舗", exact: true })).toBeVisible();
  await expect(
    page.getByRole("table").getByRole("cell").filter({ hasText: storeName }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "メンバーを招待", exact: true })).toHaveCount(0);
});

test("仮想パスキーで登録と再ログインができる", async ({ page, context, browserName, baseURL }) => {
  test.skip(browserName !== "chromium", "仮想認証器はChromiumのCDPで検証する");
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.getByRole("button", { name: /tablecast-owner@example.test/ }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await expect(page.getByRole("heading", { name: "店舗", exact: true })).toBeVisible();
  await page.goto("/account");
  const keyName = `TableCast Chromium ${Date.now()}`;
  const owner = await request.newContext({ baseURL });
  expect(
    (
      await owner.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
  cleanup.push(async () => {
    try {
      const keys = z
        .array(z.object({ id: z.string(), name: z.string().optional() }))
        .parse(await (await owner.get("/api/auth/passkey/list-user-passkeys")).json());
      const created = keys.find((key) => key.name === keyName);
      if (created)
        expect(
          (
            await owner.post("/api/auth/passkey/delete-passkey", {
              headers: { Origin: baseURL ?? "" },
              data: { id: created.id },
            })
          ).ok(),
        ).toBe(true);
    } finally {
      await owner.dispose();
    }
  });
  await page.getByLabel("パスキーの名前").fill(keyName);
  await page.getByRole("button", { name: "パスキーを追加" }).click();
  await expect(page.getByRole("status")).toHaveText("更新しました");
  // APIで認証方式を切り替える間は、元の画面のセッション監視を停止する。
  await page.goto("about:blank");
  await page.request.post("/api/auth/sign-out", { headers: { Origin: baseURL ?? "" }, data: {} });
  await page.goto("/login");
  await page.getByRole("button", { name: "パスキーでログイン" }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await expect(page.getByRole("heading", { name: "店舗", exact: true })).toBeVisible();
});

test("確認済みメールのパスワードとGoogleで同じユーザーへログインする", async ({
  page,
  baseURL,
  runtime,
}) => {
  const email = "tablecast-link@example.test";
  const password = "tablecast-email-link-acceptance-password";
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: baseURL ?? "" },
    data: { email, password, name: "TableCast 連携試験", callbackURL: "/account" },
  });
  expect(signup.ok()).toBeTruthy();
  const messages = z
    .object({
      messages: z.array(
        z.object({
          ID: z.string(),
          To: z.array(z.object({ Address: z.string() })),
          Subject: z.string(),
        }),
      ),
    })
    .parse(
      await (
        await page.request.get(`http://127.0.0.1:${runtime.ports.mailpit}/api/v1/messages`)
      ).json(),
    );
  const mail = messages.messages.find(
    (item) =>
      item.Subject.includes("Verify your email") && item.To.some((to) => to.Address === email),
  );
  expect(mail).toBeDefined();
  const content = z
    .object({ HTML: z.string() })
    .parse(
      await (
        await page.request.get(
          `http://127.0.0.1:${runtime.ports.mailpit}/api/v1/message/${mail?.ID}`,
        )
      ).json(),
    );
  const url = content.HTML.match(/href="([^"]*\/api\/auth\/verify-email[^"]+)"/u)?.[1]?.replaceAll(
    "&amp;",
    "&",
  );
  expect(url).toBeTruthy();
  await page.goto(url ?? "/account");
  const login = await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL ?? "" },
    data: { email, password },
  });
  expect(login.ok()).toBeTruthy();

  const userSchema = z.object({ user: z.object({ id: z.string() }) });
  const before = userSchema.parse(await (await page.request.get("/api/auth/get-session")).json());
  // APIで認証方式を切り替える間は、元の画面のセッション監視を停止する。
  await page.goto("about:blank");
  await page.request.post("/api/auth/sign-out", { headers: { Origin: baseURL ?? "" }, data: {} });
  await page.goto("/login");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.getByRole("button", { name: /tablecast-link@example.test/ }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await expect(page.getByRole("heading", { name: "店舗", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "店舗を作成", exact: true }).click();
  await expect(page).toHaveURL(/\/stores\/new$/);
  await expect(page.getByLabel("店舗名", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const links = z
    .array(z.object({ providerId: z.string() }))
    .parse(await (await page.request.get("/api/auth/list-accounts")).json());
  expect(links.filter((link) => link.providerId === "google")).toHaveLength(1);
  const after = userSchema.parse(await (await page.request.get("/api/auth/get-session")).json());
  expect(after.user.id).toBe(before.user.id);
});
