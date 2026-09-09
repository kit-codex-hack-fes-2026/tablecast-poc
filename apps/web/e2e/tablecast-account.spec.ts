import { readFileSync } from "node:fs";
import { test, expect, request } from "@playwright/test";
import { z } from "zod";
const runtime = z
  .object({ ports: z.object({ mailpit: z.number() }) })
  .parse(
    JSON.parse(readFileSync(new URL("../../../.local/runtime.json", import.meta.url), "utf8")),
  );

const cleanup: (() => Promise<void>)[] = [];
test.afterEach(async () => {
  for (const action of cleanup.splice(0).reverse()) await action();
});

test("Googleログインから名前変更・組織作成・招待メールまで利用できる", async ({
  page,
  baseURL,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.getByRole("button", { name: /tablecast-owner@example.test/ }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await expect(page.getByRole("heading", { name: "組織", exact: true })).toBeVisible();
  const session = z
    .object({ user: z.object({ id: z.string(), email: z.string(), emailVerified: z.boolean() }) })
    .parse(await (await page.request.get("/api/auth/get-session")).json());
  expect(session.user.emailVerified).toBe(true);
  const owner = await request.newContext({
    baseURL,
    storageState: await page.context().storageState(),
  });
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
  cleanup.push(async () => {
    const organisations = z
      .array(z.object({ id: z.string(), slug: z.string() }))
      .parse(await (await owner.get("/api/auth/organization/list")).json());
    const created = organisations.find((organisation) => organisation.slug === slug);
    if (created)
      expect(
        (
          await owner.post("/api/auth/organization/delete", {
            headers: { Origin: baseURL ?? "" },
            data: { organizationId: created.id },
          })
        ).ok(),
      ).toBe(true);
  });
  await page.getByRole("button", { name: "組織を作成", exact: true }).click();
  await page.getByLabel("組織名", { exact: true }).fill("TableCast 受入試験");
  await page.getByLabel("識別名").fill(slug);
  await page.getByRole("dialog").getByRole("button", { name: "組織を作成", exact: true }).click();
  await expect(page.getByLabel("組織を選択").locator("option:checked")).toHaveText(
    "TableCast 受入試験",
  );
  const members = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "メンバー", exact: true }) });
  await expect(members.getByText("tablecast-owner@example.test", { exact: true })).toBeVisible();
  await expect(members.getByText("tablecast-member@example.test", { exact: true })).toHaveCount(0);
  await page.getByLabel("メールアドレス", { exact: true }).fill("tablecast-member@example.test");
  await page.getByRole("button", { name: "招待メールを送信" }).click();
  await expect(
    page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "メンバーを招待", exact: true }) })
      .getByText("tablecast-member@example.test", { exact: false }),
  ).toBeVisible();
  const messages = await page.request.get(
    `http://127.0.0.1:${runtime.ports.mailpit}/api/v1/messages`,
  );
  const mail = z
    .object({ messages: z.array(z.object({ ID: z.string(), Subject: z.string() })) })
    .parse(await messages.json())
    .messages.find((item) => item.Subject.includes("Organisation invitation"));
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
  expect(invitation).toBeTruthy();
  await page.context().clearCookies();
  await page.goto(invitation ?? "/organisations");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.getByRole("button", { name: /tablecast-member@example.test/ }).click();
  await page.getByRole("button", { name: "参加する", exact: true }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await expect(page.getByRole("heading", { name: "組織", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "メンバー", exact: true })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "組織", exact: true })).toBeVisible();
  await page.goto("/account");
  const keyName = `TableCast Chromium ${Date.now()}`;
  const owner = await request.newContext({
    baseURL,
    storageState: await page.context().storageState(),
  });
  cleanup.push(async () => {
    try {
      const keys = z
        .array(z.object({ id: z.string(), name: z.string().optional() }))
        .parse(await (await page.request.get("/api/auth/passkey/list-user-passkeys")).json());
      const created = keys.find((key) => key.name === keyName);
      if (created)
        expect(
          (
            await page.request.post("/api/auth/passkey/delete-passkey", {
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
  await expect(page.getByRole("heading", { name: "組織", exact: true })).toBeVisible();
});

test("確認済みメールのパスワードとGoogleで同じユーザーへログインする", async ({
  page,
  baseURL,
}) => {
  const email = "tablecast-link@example.test";
  const password = "tablecast-email-link-acceptance-password";
  const existing = await page.request.post("/api/auth/sign-in/email", {
    headers: { Origin: baseURL ?? "" },
    data: { email, password },
  });
  if (!existing.ok()) {
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
    const url = content.HTML.match(
      /href="([^"]*\/api\/auth\/verify-email[^"]+)"/u,
    )?.[1]?.replaceAll("&amp;", "&");
    expect(url).toBeTruthy();
    await page.goto(url ?? "/account");
    const login = await page.request.post("/api/auth/sign-in/email", {
      headers: { Origin: baseURL ?? "" },
      data: { email, password },
    });
    expect(login.ok()).toBeTruthy();
  }
  const userSchema = z.object({ user: z.object({ id: z.string() }) });
  const before = userSchema.parse(await (await page.request.get("/api/auth/get-session")).json());
  // APIで認証方式を切り替える間は、元の画面のセッション監視を停止する。
  await page.goto("about:blank");
  await page.request.post("/api/auth/sign-out", { headers: { Origin: baseURL ?? "" }, data: {} });
  await page.goto("/login");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.getByRole("button", { name: /tablecast-link@example.test/ }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await expect(page.getByRole("heading", { name: "組織", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最初の組織を作成" })).toBeVisible();
  await page.getByRole("button", { name: "組織を作成", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("組織名", { exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "閉じる", exact: true }).click();
  const links = z
    .array(z.object({ providerId: z.string() }))
    .parse(await (await page.request.get("/api/auth/list-accounts")).json());
  expect(links.filter((link) => link.providerId === "google")).toHaveLength(1);
  const after = userSchema.parse(await (await page.request.get("/api/auth/get-session")).json());
  expect(after.user.id).toBe(before.user.id);
});
