import { test } from "./support/test";
import { expect } from "@playwright/test";
import { z } from "zod";

// Authの失敗応答を差し替えるHTTP境界をSWに迂回させない。
test.use({ trace: "off", serviceWorkers: "block" });

test("Googleログインから名前変更・店舗作成・招待メールまで利用できる", async ({
  page,
  baseURL,
  runtime,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.getByRole("button", { name: /haruka.sato@komorebi-shijo.com/ }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await expect(page.getByRole("heading", { name: "店舗", exact: true })).toBeVisible();
  const session = z
    .object({ user: z.object({ id: z.string(), email: z.string(), emailVerified: z.boolean() }) })
    .parse(await (await page.request.get("/api/auth/get-session")).json());
  expect(session.user.emailVerified).toBe(true);
  // OAuth後のSSRがhydrateされてからクライアント遷移を始める。
  await expect(page.getByRole("button", { name: "ナビゲーション", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "アカウント", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const update = Promise.withResolvers<void>();
  const requested = Promise.withResolvers<void>();
  await page.route("**/api/auth/update-user", async (route) => {
    requested.resolve();
    await update.promise;
    await route.continue();
  });
  try {
    await page.getByLabel("名前", { exact: true }).fill("TableCast テストオーナー");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await requested.promise;
    await expect(page.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
    const feedback = page.getByRole("status").filter({ hasText: "送信中" });
    await expect(feedback).toBeVisible();
    await expect(feedback.locator("svg")).toHaveCSS("animation-name", "none");
  } finally {
    update.resolve();
  }
  await expect(page.getByRole("status")).toHaveText("更新しました");
  await page.goto("/organisations");
  await expect(page.getByRole("button", { name: "ナビゲーション", exact: true })).toBeEnabled();
  const slug = `tablecast-acceptance-${Date.now()}`;
  await page.getByRole("link", { name: "店舗を作成", exact: true }).click();
  await expect(page).toHaveURL(/\/stores\/new$/);
  const storeName = `TableCast 受入試験 ${slug}`;
  await page.getByLabel("店舗名", { exact: true }).fill(storeName);
  await page.getByLabel("識別名").fill(slug);
  // カタログ読込中も見出しと表を保ち、データの読込完了から次へ進む。
  const catalogRequested = Promise.withResolvers<void>();
  const catalogReady = Promise.withResolvers<void>();
  await page.route("**/api/admin/stores/*/catalog", async (route) => {
    catalogRequested.resolve();
    await catalogReady.promise;
    await route.continue();
  });
  await page.getByRole("button", { name: "店舗を作成", exact: true }).click();
  try {
    await catalogRequested.promise;
    await expect(page.getByRole("status").filter({ hasText: "読み込んでいます" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "商品", exact: true })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  } finally {
    catalogReady.resolve();
  }
  await expect(page).toHaveURL(/\/menu\/products$/);
  // 見出しは読込中にも表示されるため、表の読込完了を待って一度だけ操作する。
  await expect(page.getByRole("heading", { name: "商品", exact: true })).toBeVisible();
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await page.getByRole("link", { name: "メンバー", exact: true }).click();
  await expect(page).toHaveURL(/\/members$/);
  await expect(
    page.getByRole("table").getByText("haruka.sato@komorebi-shijo.com", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByText("ren.tanaka@komorebi-shijo.com", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "招待", exact: true }).click();
  await page.getByRole("link", { name: "メンバーを招待", exact: true }).click();
  await expect(page).toHaveURL(/\/invitations\/new$/);
  await expect(page.getByRole("heading", { name: "メンバーを招待", exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "メールアドレス", exact: true })
    .fill("ren.tanaka@komorebi-shijo.com");
  await expect(page.getByRole("textbox", { name: "メールアドレス", exact: true })).toHaveValue(
    "ren.tanaka@komorebi-shijo.com",
  );
  const sending = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/organization/invite-member") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "招待メールを送信" }).click();
  const invitationId = z.object({ id: z.string() }).parse(await (await sending).json()).id;
  await expect(
    page.getByRole("table").getByText("ren.tanaka@komorebi-shijo.com", { exact: true }),
  ).toBeVisible();
  const messages = await page.request.get(`${runtime.mailpitUrl}/api/v1/messages`);
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
        item.To.some((to) => to.Address === "ren.tanaka@komorebi-shijo.com"),
    );
  expect(mail).toBeDefined();
  const content = z
    .object({ HTML: z.string(), Text: z.string() })
    .parse(
      await (await page.request.get(`${runtime.mailpitUrl}/api/v1/message/${mail?.ID}`)).json(),
    );
  expect(content.HTML).toContain(`src="${baseURL}/brand/tablecast-logo.png"`);
  expect(content.HTML).toContain('alt="TableCast"');
  expect(content.Text).toMatch(/^TableCast\n/);
  expect((await page.request.get("/brand/tablecast-logo.png")).ok()).toBe(true);
  const invitation = content.HTML.match(/href="([^"]*\/invitations\/[^"?]+)"/u)?.[1];
  expect(invitation).toBe(`${baseURL}/invitations/${invitationId}`);
  await page.context().clearCookies();
  await page.goto(invitation ?? "/organisations");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.getByRole("button", { name: /ren.tanaka@komorebi-shijo.com/ }).click();
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
  await page.getByRole("button", { name: /haruka.sato@komorebi-shijo.com/ }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await expect(page.getByRole("heading", { name: "店舗", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ナビゲーション", exact: true })).toBeEnabled();
  await page.getByRole("link", { name: "アカウント", exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  const keyName = `TableCast Chromium ${Date.now()}`;
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
  const email = "rin.ogawa@komorebi-shijo.com";
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
    .parse(await (await page.request.get(`${runtime.mailpitUrl}/api/v1/messages`)).json());
  const mail = messages.messages.find(
    (item) =>
      item.Subject.includes("Verify your email") && item.To.some((to) => to.Address === email),
  );
  expect(mail).toBeDefined();
  const content = z
    .object({ HTML: z.string() })
    .parse(
      await (await page.request.get(`${runtime.mailpitUrl}/api/v1/message/${mail?.ID}`)).json(),
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
  await page.getByRole("button", { name: /rin.ogawa@komorebi-shijo.com/ }).click();
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
