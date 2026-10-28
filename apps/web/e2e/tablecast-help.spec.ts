import { expect } from "@playwright/test";
import { detectPlatform } from "@tanstack/react-hotkeys";
import { signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ serviceWorkers: "block" });

test("未認証で日英のドキュメントとMarkdownを辿れ、管理画面と業務APIは認証を要求する", async ({
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

  const inflection = await request.get("/help/search?query=configurations&locale=en");
  expect(inflection.status()).toBe(200);
  expect(await inflection.text()).toContain("/help/en/configuration");
  const japanese = await request.get("/help/search?query=ＭＣＰ&locale=ja");
  expect(await japanese.text()).toContain("/help/ja/mcp");
  const search = await request.get("/help/search?query=expectedVersion&locale=en");
  expect(search.status()).toBe(200);
  expect(await search.text()).toContain("/help/en/configuration");
  expect(await search.text()).not.toContain("/help/ja/");
  expect((await request.get("/help/search?query=x&locale=fr")).status()).toBe(400);
  const destination = await request.get("/admin/go/products", { maxRedirects: 0 });
  expect(destination.status()).toBe(307);
  expect(destination.headers().location).toContain("/login");

  const admin = await request.get("/admin/live", { maxRedirects: 0 });
  expect(admin.status()).toBe(307);
  expect(admin.headers().location).toContain("/login");
  expect((await request.get("/api/admin/stores")).status()).toBe(401);
  expect((await request.post("/mcp", { data: {} })).status()).toBe(401);
});

test("ドキュメントをSSRで読み、関連章・言語・モバイル目次へ移動できる", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  const identityRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/api/auth/") || path.startsWith("/api/admin/"))
      identityRequests.push(path);
  });
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
  await page.setViewportSize({ width: 1512, height: 982 });
  const navigationToggle = page.getByRole("button", { name: "ナビゲーション", exact: true });
  const hydration = Promise.withResolvers<void>();
  await page.route(/\/assets\/[^/]+\.js(?:\?|$)/, async (route) => {
    await hydration.promise;
    await route.continue();
  });
  try {
    await page.goto("/help", { waitUntil: "commit" });
    await expect(navigationToggle).toBeDisabled();
  } finally {
    hydration.resolve();
    await page.unrouteAll({ behavior: "wait" });
  }
  await expect(
    page.getByRole("heading", { name: "TableCast ドキュメント", exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-ui="app-header"]')).toHaveCount(1);
  await expect(navigationToggle).toHaveCount(1);
  await expect(page.locator('[data-ui="navigation-toggle"]')).toHaveCount(1);
  await expect(page.locator('[data-ui="app-header"] [data-ui="navigation-toggle"]')).toHaveCount(1);
  await expect(page.locator("[data-sidebar-panel]")).toHaveCount(0);
  await expect(navigationToggle).toBeEnabled();
  // runnerのOSとWebKitのnavigatorが異なるため、製品と同じブラウザー側の判定を使う。
  const platform = await page.evaluate(detectPlatform);
  await page.keyboard.press(platform === "mac" ? "Meta+b" : "Control+b");
  await expect(navigationToggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#nd-sidebar")).toHaveAttribute("data-collapsed", "true");
  await expect(
    page.locator("#nd-sidebar").getByRole("link", { name: "はじめに", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-help-collapsed.png"),
    fullPage: false,
    animations: "disabled",
  });
  await navigationToggle.click();
  await expect(navigationToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "日本語", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const helpGroup = page.getByRole("region", { name: "ドキュメント", exact: true });
  const groupTrigger = helpGroup.getByRole("button", { name: "ドキュメント", exact: true });
  await expect(groupTrigger).toHaveAttribute("aria-expanded", "true");
  await expect(helpGroup.getByRole("link")).toHaveCount(6);
  await groupTrigger.click();
  await expect(helpGroup.getByRole("link", { name: "はじめに", exact: true })).toBeHidden();
  await groupTrigger.press("Enter");
  await expect(helpGroup.getByRole("link", { name: "はじめに", exact: true })).toBeVisible();
  const searchInput = page.getByRole("searchbox", { name: "検索", exact: true });
  await searchInput.fill("expectedVersion");
  const searchResults = page.getByRole("dialog", { name: "検索結果" });
  await expect(searchResults.getByRole("link", { name: /設定と公開/ }).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-help-search.png"),
    fullPage: false,
    animations: "disabled",
  });
  await searchResults
    .getByRole("link", { name: /設定と公開/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/help\/ja\/configuration(#|$)/);
  await page.goto("/help/ja");
  const guide = page.getByRole("main");
  await guide.getByRole("link", { name: "MCP接続とagentの使い方", exact: true }).click();
  await expect(page).toHaveURL(/\/help\/ja\/mcp$/);
  await expect(
    page.getByRole("heading", { name: "MCP接続とagentの使い方", exact: true }),
  ).toBeVisible();
  await expect(
    helpGroup.getByRole("link", { name: "MCP接続とagentの使い方", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const activeChapter = helpGroup.getByRole("link", {
    name: "MCP接続とagentの使い方",
    exact: true,
  });
  expect(
    await activeChapter.evaluate((link) => {
      const row = link.getBoundingClientRect();
      const marker = link
        .querySelector('[data-slot="navigation-selection"]')
        ?.getBoundingClientRect();
      const label = link.querySelector("span:not([aria-hidden])");
      if (!marker || !label) throw new Error("選択線とリンク名が必要");
      const text = label.getBoundingClientRect();
      return {
        markerInside:
          marker.top >= row.top &&
          marker.bottom <= row.bottom &&
          Math.abs((marker.top + marker.bottom - row.top - row.bottom) / 2) <= 1,
        textPadded: text.top > row.top && text.bottom < row.bottom,
        multiline: text.height > parseFloat(getComputedStyle(label).lineHeight),
      };
    }),
  ).toEqual({ markerInside: true, textPadded: true, multiline: true });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight))
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("tablecast-help-ja.png"),
    fullPage: false,
    animations: "disabled",
  });
  await expect(page.locator('[data-ui="page-body"] #nd-toc')).toBeVisible();
  await expect(
    page
      .locator('#nd-sidebar [data-ui="sidebar-footer"]')
      .getByRole("link", { name: "TableCast アプリを開く", exact: true }),
  ).toHaveAttribute("href", "/admin/live");
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.screenshot({
    path: testInfo.outputPath("tablecast-help-ipad.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page).toHaveURL(/\/help\/en\/mcp\/?$/);
  await expect(
    page.getByRole("heading", { name: "MCP connections and agents", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page).toHaveTitle(/MCP connections and agents.*Documentation/);
  await expect(page.getByRole("button", { name: "English", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("searchbox", { name: "Search", exact: true }).fill("configurations");
  const englishResults = page.getByRole("dialog", { name: "Search results" });
  await expect(
    englishResults.getByRole("link", { name: /Configuration and publishing/ }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-help-en-search.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("searchbox", { name: "Search", exact: true }).press("Escape");
  await page.setViewportSize({ width: 402, height: 874 });
  await expect(page.locator('[data-ui="app-header"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("tablecast-help-en-mobile.png"),
    fullPage: false,
    animations: "disabled",
  });
  const toc = page.locator('[data-ui="page-body"] [data-toc-popover]');
  await toc.locator("[data-toc-popover-trigger]").click();
  await expect(
    toc.getByRole("link", { name: "Choose a starting point", exact: true }),
  ).toBeVisible();
  await toc.locator("[data-toc-popover-trigger]").click();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "MCP接続とagentの使い方", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 402, height: 874 });
  await expect(
    page.getByRole("heading", { name: "MCP接続とagentの使い方", exact: true }),
  ).toBeVisible();
  await expect(navigationToggle).toHaveCount(1);
  await navigationToggle.click();
  const navigationDrawer = page.getByRole("dialog", { name: "ナビゲーション", exact: true });
  await expect(navigationDrawer).toBeVisible();
  await expect
    .poll(() => navigationDrawer.evaluate((drawer) => drawer.getBoundingClientRect().left))
    .toBe(0);
  await expect(navigationDrawer.locator('[data-ui="navigation-toggle"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(navigationDrawer).toBeHidden();
  await expect(navigationToggle).toBeFocused();
  await navigationToggle.click();
  await page.setViewportSize({ width: 1512, height: 982 });
  await expect(navigationDrawer).toBeHidden();
  await page.setViewportSize({ width: 402, height: 874 });
  await expect(navigationDrawer).toBeHidden();
  await navigationToggle.click();
  await expect(
    page
      .getByRole("region", { name: "ドキュメント", exact: true })
      .getByRole("button", { name: "ドキュメント", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await page.screenshot({
    path: testInfo.outputPath("tablecast-help-mobile-sidebar.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("searchbox", { name: "検索", exact: true }).fill("困ったとき");
  const mobileResults = page.getByRole("dialog", { name: "検索結果" });
  await expect(mobileResults.getByRole("link", { name: /困ったとき/ }).first()).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-help-mobile-search.png"),
    fullPage: false,
    animations: "disabled",
  });
  await mobileResults
    .getByRole("link", { name: /困ったとき/ })
    .first()
    .click();
  await expect(page.locator("#nd-sidebar-mobile")).toBeHidden();
  await expect(page.getByRole("heading", { name: "困ったとき", exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath("tablecast-help-mobile.png"), fullPage: true });
  expect(identityRequests).toEqual([]);
});

test("店舗サイドバーの検索から公開ガイドへ進める", async ({ page, baseURL }, testInfo) => {
  await signInStaff(page.request, baseURL);
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto("/admin/go/products");
  await expect(page).toHaveURL(/\/admin\/stores\/[^/]+\/menu\/products$/);
  await page.goto("/admin/live");
  await expect(page.getByRole("button", { name: "ナビゲーション", exact: true })).toHaveCount(1);
  expect(
    await page
      .locator('[data-ui="navigation-toggle"]')
      .evaluateAll((buttons) =>
        buttons.every((button) => button.closest('[data-ui="app-header"]')),
      ),
  ).toBe(true);
  await expect(page.getByRole("region", { name: "ドキュメント", exact: true })).toHaveCount(0);
  const docsLink = page
    .locator('[data-ui="sidebar-footer"]')
    .getByRole("link", { name: "ドキュメント", exact: true });
  await expect(docsLink).toHaveAttribute("href", "/help/ja");
  await expect(docsLink).toHaveAttribute("target", "_blank");
  await page.getByRole("button", { name: "連携・店舗一覧", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("tablecast-admin-sidebar.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.getByRole("searchbox", { name: "検索", exact: true }).fill("商品");
  const results = page.getByRole("dialog", { name: "検索結果" });
  await expect(results.getByRole("link", { name: "商品 メニュー・接客" })).toBeVisible();
  await expect(results.getByRole("status")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("tablecast-sidebar-search.png"),
    fullPage: false,
    animations: "disabled",
  });
  await results.getByRole("link", { name: "商品 メニュー・接客" }).click();
  await expect(page).toHaveURL(/\/admin\/stores\/[^/]+\/menu\/products$/);
  await expect(page.locator('[data-ui="app-header"]')).toHaveCount(1);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "English", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const englishDocsLink = page
    .locator('[data-ui="sidebar-footer"]')
    .getByRole("link", { name: "Documentation", exact: true });
  await expect(englishDocsLink).toHaveAttribute("href", "/help/en");
  const popupOpened = page.waitForEvent("popup");
  await englishDocsLink.click();
  const docsPage = await popupOpened;
  try {
    await expect(docsPage).toHaveURL(/\/help\/en\/?$/);
    await expect(
      docsPage.getByRole("heading", { name: "TableCast Documentation", exact: true }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/stores\/[^/]+\/menu\/products$/);
  } finally {
    await docsPage.close();
  }
  await page.setViewportSize({ width: 402, height: 874 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("tablecast-admin-en-mobile.png"),
    fullPage: false,
    animations: "disabled",
  });
  const mobileToggle = page.getByRole("button", { name: "Navigation", exact: true });
  await expect(mobileToggle).toHaveCount(1);
  await mobileToggle.click();
  const navigationDrawer = page.getByRole("dialog", { name: "Navigation", exact: true });
  await expect(navigationDrawer).toBeVisible();
  await expect
    .poll(() => navigationDrawer.evaluate((drawer) => drawer.getBoundingClientRect().left))
    .toBe(0);
  const brand = navigationDrawer.getByRole("img", { name: "TableCast", exact: true });
  await brand.evaluate((image) => {
    if (!(image instanceof HTMLImageElement)) throw new Error("ロゴ画像が必要");
    return image.decode();
  });
  await expect(brand).toBeVisible();
  await expect(navigationDrawer.locator('[data-ui="navigation-toggle"]')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("tablecast-admin-en-mobile-sidebar.png"),
    fullPage: false,
    animations: "disabled",
  });
  await page.keyboard.press("Escape");
  await expect(navigationDrawer).toBeHidden();
  await expect(mobileToggle).toBeFocused();
  await page.getByRole("button", { name: "日本語", exact: true }).click();
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.getByRole("searchbox", { name: "検索", exact: true }).fill("MCP");
  const guide = results.getByRole("link", { name: /MCP接続とagentの使い方/ }).first();
  await expect(guide).toBeVisible();
  await guide.click();
  await expect(page).toHaveURL(/\/help\/ja\/mcp(#|$)/);
  await expect(
    page.getByRole("heading", { name: "MCP接続とagentの使い方", exact: true }),
  ).toBeVisible();
});
