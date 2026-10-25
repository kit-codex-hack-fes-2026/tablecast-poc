import { expect } from "@playwright/test";
import { signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ serviceWorkers: "block" });

test("未認証で日英のヘルプとMarkdownを辿れ、管理画面と業務APIは認証を要求する", async ({
  request,
}) => {
  const index = await request.get("/llms.txt");
  expect(index.status()).toBe(200);
  expect(index.headers()["content-type"]).toContain("text/plain");
  const listing = await index.text();
  const paths = [...listing.matchAll(/\]\((\/help\/content\/[^)]+\.md)\)/g)].map(
    (match) => match[1],
  );
  expect(new Set(paths).size).toBe(12);
  for (const path of paths) {
    if (!path) throw new Error("索引にMarkdown URLが必要");
    const markdown = await request.get(path);
    expect(markdown.status(), path).toBe(200);
    expect(markdown.headers()["content-type"]).toContain("text/markdown");
    const text = await markdown.text();
    expect(text).toMatch(/^# /);
    expect(text).not.toContain("<!DOCTYPE html>");
    expect(text).not.toMatch(/\]\(\.\.?\//);
    const html = await request.get(
      path
        .replace("/help/content/", "/help/")
        .replace(/\/index\.md$/, "")
        .replace(/\.md$/, ""),
    );
    expect(html.status(), path).toBe(200);
  }
  const full = await request.get("/llms-full.txt");
  expect(full.status()).toBe(200);
  expect(await full.text()).toContain("/help/content/en/mcp.md");
  for (const missing of [
    "/help/ja/missing",
    "/help/fr/mcp",
    "/help/content/ja/missing.md",
    "/help/content/fr/mcp.md",
  ])
    expect((await request.get(missing)).status(), missing).toBe(404);

  const admin = await request.get("/admin/live", { maxRedirects: 0 });
  expect(admin.status()).toBe(307);
  expect(admin.headers().location).toContain("/login");
  expect((await request.get("/api/admin/stores")).status()).toBe(401);
  expect((await request.post("/mcp", { data: {} })).status()).toBe(401);
});

test("ヘルプをSSRで読み、関連章・言語・モバイル目次へ移動できる", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const anonymous = await browser.newContext({ baseURL, javaScriptEnabled: false });
  try {
    const ssr = await anonymous.newPage();
    await ssr.goto("/help/en/mcp");
    await expect(
      ssr.getByRole("heading", { name: "MCP connections and agents", exact: true }),
    ).toBeVisible();
    await expect(ssr.locator("html")).toHaveAttribute("lang", "en");
  } finally {
    await anonymous.close();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "TableCast ヘルプ", exact: true })).toBeVisible();
  const guide = page.getByRole("main");
  await guide.getByRole("link", { name: "MCP接続とagentの使い方", exact: true }).click();
  await expect(page).toHaveURL(/\/help\/ja\/mcp$/);
  await expect(
    page.getByRole("heading", { name: "MCP接続とagentの使い方", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("tablecast-help-ja.png"), fullPage: true });
  await page.getByRole("link", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(/\/help\/en\/mcp\/?$/);
  await expect(
    page.getByRole("heading", { name: "MCP connections and agents", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle(/MCP connections and agents.*Help/);
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "MCP接続とagentの使い方", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "MCP接続とagentの使い方", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "目次を開く", exact: true }).click();
  await page
    .getByRole("complementary")
    .getByRole("link", { name: "困ったとき", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "困ったとき", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath("tablecast-help-mobile.png"), fullPage: true });
});

test("店舗サイドバーのヘルプグループから公開ガイドへ進める", async ({
  page,
  baseURL,
}, testInfo) => {
  await signInStaff(page.request, baseURL);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/live");
  const help = page.getByRole("region", { name: "ヘルプ", exact: true });
  await expect(help.getByRole("button", { name: "ヘルプ", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(help.getByRole("link", { name: "MCP・agentガイド", exact: true })).toHaveAttribute(
    "href",
    "/help/ja/mcp",
  );
  await help.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-help-sidebar.png"),
    fullPage: false,
  });
  await help.getByRole("link", { name: "使い方ガイド", exact: true }).click();
  await expect(page.getByRole("heading", { name: "TableCast ヘルプ", exact: true })).toBeVisible();
});
