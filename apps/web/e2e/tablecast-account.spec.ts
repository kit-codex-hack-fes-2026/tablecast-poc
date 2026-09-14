import { test } from "./support/test";
import { expect } from "@playwright/test";
import { z } from "zod";
import { writeFile } from "node:fs/promises";

// Authの失敗応答を差し替えるHTTP境界をSWに迂回させない。
test.use({ trace: "off", serviceWorkers: "block" });

test("Googleログインから名前変更・店舗作成・招待メールまで利用できる", async ({
  page,
  baseURL,
  runtime,
}, testInfo) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.getByRole("button", { name: /tablecast-owner@example.test/ }).click();
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
  const storeName = `TableCast 受入試験 ${slug}`;
  // #145の調査: 認証情報を含めず、操作対象と遷移・取得の境界を記録する。
  const navigation: string[] = [];
  page.on("console", (message) => {
    if (message.text().startsWith("tablecast-navigation:")) navigation.push(message.text());
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigation.push(`URL ${new URL(frame.url()).pathname}`);
  });
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path.startsWith("/api/admin/stores") || path.endsWith("/get-full-organization"))
      navigation.push(`${response.request().method()} ${path} ${response.status()}`);
  });
  await page.evaluate(() => {
    for (const type of ["pointerdown", "pointerup", "click"]) {
      document.addEventListener(
        type,
        (event) => {
          const target = event.target;
          const link = target instanceof Element ? target.closest("a") : null;
          const record = {
            type,
            path: location.pathname,
            href: link?.getAttribute("href"),
            heading: document.querySelector("h1")?.textContent,
          };
          queueMicrotask(() =>
            console.info(
              "tablecast-navigation:",
              JSON.stringify({
                ...record,
                connected: target instanceof Node && target.isConnected,
                prevented: event.defaultPrevented,
              }),
            ),
          );
        },
        { capture: true },
      );
    }
  });
  try {
    await page.getByRole("link", { name: "店舗を作成", exact: true }).click();
    await expect(page).toHaveURL(/\/stores\/new$/);
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
  } finally {
    const path = testInfo.outputPath("tablecast-navigation.log");
    await writeFile(path, navigation.join("\n"));
    await testInfo.attach("tablecast-navigation", {
      path,
      contentType: "text/plain",
    });
  }
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
        item.To.some((to) => to.Address === "tablecast-member@example.test"),
    );
  expect(mail).toBeDefined();
  const content = z
    .object({ HTML: z.string() })
    .parse(
      await (await page.request.get(`${runtime.mailpitUrl}/api/v1/message/${mail?.ID}`)).json(),
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
