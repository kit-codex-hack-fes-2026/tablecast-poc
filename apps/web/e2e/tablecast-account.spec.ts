import { expect } from "@playwright/test";
import { z } from "zod";
import { signInDemoOwner } from "../../../scripts/tablecast-demo-auth";
import { credentials } from "./support/runtime";
import { signInFromLogin, signInStaff } from "./support/session";
import { test } from "./support/test";

// 認証・招待・メールの実HTTP接続を確認する。
test.use({ trace: "off", serviceWorkers: "block" });

test("背景デモは新しい実メールで再認証し、パスキーなしでも本人の範囲で利用できる", async ({
  request,
  runtime,
}) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cookie = await signInDemoOwner(runtime.origin, runtime.mailpitUrl, credentials.email);
    const stores = await request.get(`${runtime.origin}/api/admin/stores`, {
      headers: { Cookie: cookie },
    });
    expect(stores.status()).toBe(200);
  }
  const cookie = await signInDemoOwner(
    runtime.origin,
    runtime.mailpitUrl,
    "tablecast-demo-unregistered@example.test",
  );
  const empty = await request.get(`${runtime.origin}/api/admin/stores`, {
    headers: { Cookie: cookie },
  });
  expect(empty.status()).toBe(200);
  expect(await empty.json()).toMatchObject({ stores: [] });
});

test("メールログインは外部として解釈される戻り先を使わず指定店舗の下書きへ復帰する", async ({
  page,
  baseURL,
}) => {
  const storeId = "tablecast-hanul";
  await signInStaff(page.request, baseURL);
  const created = await page.request.post(`/api/admin/stores/${storeId}/drafts`, {
    headers: { Origin: baseURL ?? "" },
  });
  expect(created.ok()).toBe(true);
  const draft = z.object({ id: z.string() }).parse(await created.json());
  const signedOut = await page.request.post("/api/auth/sign-out", {
    headers: { Origin: baseURL ?? "" },
    data: {},
  });
  expect(signedOut.ok()).toBe(true);
  await page.route("https://external.example.test/**", (route) => route.abort());
  const query = new URLSearchParams({
    returnTo: "/\\external.example.test/path",
    returnStoreId: storeId,
    returnDraftId: draft.id,
  });
  await page.goto(`/login?${query}`);
  await signInFromLogin(page, baseURL);
  await expect(page).toHaveURL(`${baseURL}/admin/stores/${storeId}/menu/changes/${draft.id}`);
  await expect(page.getByRole("heading", { name: "変更内容を確認", exact: true })).toBeVisible();
});

test("Googleログインから店舗作成・招待メールの参加まで接続する", async ({
  page,
  baseURL,
  runtime,
}) => {
  await page.goto(`/login?${new URLSearchParams({ returnTo: "/organisations" })}`);
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
  const slug = `tablecast-acceptance-${Date.now()}`;
  await page.getByRole("link", { name: "店舗を作成", exact: true }).click();
  await expect(page).toHaveURL(/\/stores\/new$/);
  const storeName = `TableCast 受入試験 ${slug}`;
  await page.getByLabel("店舗名", { exact: true }).fill(storeName);
  await page.getByLabel("識別名").fill(slug);
  await page.getByRole("button", { name: "店舗を作成", exact: true }).click();
  await expect(page).toHaveURL(/\/menu\/products$/);
  // 見出しは読込中にも表示されるため、表の読込完了を待って一度だけ操作する。
  await expect(page.getByRole("heading", { name: "商品", exact: true })).toBeVisible();
  const productTable = page.getByRole("table");
  await expect(
    page.getByRole("main").locator("[aria-busy]").filter({ has: productTable }),
  ).toHaveAttribute("aria-busy", "false");
  const management = page.getByRole("button", { name: "店舗管理", exact: true });
  if ((await management.getAttribute("aria-expanded")) === "false") await management.click();
  await expect(management).toHaveAttribute("aria-expanded", "true");
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
  const sent = await sending;
  expect(sent.ok()).toBe(true);
  const invitationId = z.object({ id: z.string() }).parse(await sent.json()).id;
  await expect(page).toHaveURL(/\/invitations$/);
  await expect(
    page.getByRole("table").getByText("ren.tanaka@komorebi-shijo.com", { exact: true }),
  ).toBeVisible();
  const messagesSchema = z.object({
    messages: z.array(
      z.object({
        ID: z.string(),
        Subject: z.string(),
        To: z.array(z.object({ Address: z.string() })),
      }),
    ),
  });
  let mailId: string | undefined;
  await expect
    .poll(async () => {
      const messages = await page.request.get(`${runtime.mailpitUrl}/api/v1/messages`);
      expect(messages.ok()).toBe(true);
      mailId = messagesSchema
        .parse(await messages.json())
        .messages.find(
          (item) =>
            (item.Subject.includes("招待") || item.Subject.includes("Invitation")) &&
            item.To.some((to) => to.Address === "ren.tanaka@komorebi-shijo.com"),
        )?.ID;
      return mailId;
    })
    .toBeTruthy();
  if (!mailId) throw new Error("送信した招待メールがありません");
  const content = z
    .object({ HTML: z.string(), Text: z.string() })
    .parse(await (await page.request.get(`${runtime.mailpitUrl}/api/v1/message/${mailId}`)).json());
  expect((await page.request.get("/brand/tablecast-logo.png")).ok()).toBe(true);
  const invitation = content.HTML.match(/href="([^"]*\/invitations\/[^"?]+)"/u)?.[1];
  expect(invitation).toBe(`${baseURL}/invitations/${invitationId}`);
  await page.context().clearCookies();
  await page.goto(invitation ?? "/organisations");
  await page.getByRole("button", { name: "Googleでログイン" }).click();
  await page.getByRole("button", { name: /ren.tanaka@komorebi-shijo.com/ }).click();
  await expect(page).toHaveURL(new RegExp(`/invitations/${invitationId}$`));
  const recipient = z
    .object({ user: z.object({ id: z.string(), email: z.string() }) })
    .parse(await (await page.request.get("/api/auth/get-session")).json());
  expect(recipient.user.email).toBe("ren.tanaka@komorebi-shijo.com");
  expect(recipient.user.id).not.toBe(session.user.id);
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
  await signInStaff(page.request, baseURL);
  const sessionSchema = z.object({
    user: z.object({ id: z.string() }),
    session: z.object({ id: z.string() }),
  });
  const before = sessionSchema.parse(
    await (await page.request.get("/api/auth/get-session")).json(),
  );
  await page.goto("/account");
  const passkeys = page
    .getByRole("main")
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "パスキー", exact: true }),
    });
  const keyName = `TableCast Chromium ${Date.now()}`;
  await passkeys.getByLabel("パスキーの名前", { exact: true }).fill(keyName);
  await passkeys.getByRole("button", { name: "パスキーを追加", exact: true }).click();
  await expect(passkeys.getByRole("cell").filter({ hasText: keyName })).toBeVisible();
  // APIで認証方式を切り替える間は、元の画面のセッション監視を停止する。
  await page.goto("about:blank");
  expect(
    (
      await page.request.post("/api/auth/sign-out", {
        headers: { Origin: baseURL ?? "" },
        data: {},
      })
    ).ok(),
  ).toBe(true);
  expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
  await page.goto("/login?returnTo=%2Forganisations");
  await page.getByRole("button", { name: "パスキーでログイン" }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  await expect(page.getByRole("heading", { name: "店舗", exact: true })).toBeVisible();
  const after = sessionSchema.parse(await (await page.request.get("/api/auth/get-session")).json());
  expect(after.user.id).toBe(before.user.id);
  expect(after.session.id).not.toBe(before.session.id);
});

test("招待から登録したユーザーはパスキーを後回しにして参加できる", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  await signInStaff(page.request, baseURL);
  const email = "tablecast-new-invitee@example.test";
  const stores = z
    .object({ stores: z.array(z.object({ id: z.string(), organizationId: z.string() })) })
    .parse(await (await page.request.get("/api/admin/stores")).json());
  const store = stores.stores.find((item) => item.id === "tablecast-komorebi");
  if (!store) throw new Error("fixtureの店舗がありません。");
  const invited = await page.request.post("/api/auth/organization/invite-member", {
    headers: { Origin: baseURL ?? "" },
    data: { email, role: "member", organizationId: store.organizationId },
  });
  expect(invited.ok()).toBe(true);
  const invitation = z.object({ id: z.string() }).parse(await invited.json());
  await context.clearCookies();
  await page.goto(`/invitations/${invitation.id}`);
  await expect(page.getByRole("button", { name: "パスキーでログイン" })).toBeEnabled();
  for (const [name, width, height] of [
    ["iphone", 402, 874],
    ["ipad", 1180, 820],
    ["macbook", 1512, 982],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: testInfo.outputPath(`tablecast-login-${name}.png`) });
  }
  await signInFromLogin(page, baseURL, email);
  await expect(page).toHaveURL(/\/passkey-setup\?/);
  const permitted = await page.request.get("/api/admin/stores");
  expect(permitted.status()).toBe(200);
  await page.screenshot({ path: testInfo.outputPath("tablecast-passkey-optional.png") });
  await page.getByRole("button", { name: "あとで設定", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/invitations/${invitation.id}$`));
  await page.getByRole("button", { name: "参加する", exact: true }).click();
  await expect(page).toHaveURL(/\/organisations$/);
  const memberships = z
    .object({ stores: z.array(z.object({ id: z.string(), role: z.string() })) })
    .parse(await (await page.request.get("/api/admin/stores")).json());
  expect(memberships.stores).toContainEqual(
    expect.objectContaining({ id: "tablecast-komorebi", role: "member" }),
  );
});
