import { test } from "./support/test";
import { expect } from "@playwright/test";
import ja from "../messages/ja.json" with { type: "json" };
import en from "../messages/en.json" with { type: "json" };
import connection from "../../../plugins/tablecast/.mcp.json" with { type: "json" };
import { credentials } from "./support/runtime";

// 認証情報をtraceへ保存しない。
test.use({ trace: "off" });
test.beforeEach(async ({ page, baseURL }) => {
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: { Origin: baseURL ?? "" },
        data: credentials,
      })
    ).ok(),
  ).toBe(true);
});

test("メニューの子ページをサイドバーから開き、再読込とモバイルでも現在地を展開する", async ({
  page,
}, testInfo) => {
  // Given: メニュー以外の管理ページ。
  await page.goto("/account");
  const trigger = page.getByRole("button", { name: ja.admin_config, exact: true });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  // When: メニューを展開し、カテゴリページへ移動する。
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const menu = page.getByRole("navigation", { name: ja.admin_config, exact: true });
  const categories = menu.getByRole("link", { name: ja.editor_categories, exact: true });
  await categories.click();
  await expect(page).toHaveURL(/\/menu\/categories$/);
  await expect(categories).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("main").getByRole("heading", { name: ja.editor_categories, exact: true }),
  ).toBeVisible();
  await page.reload({ waitUntil: "commit" });
  // Then: ページ内に同じタブを重複させず、現在の子ページを表示する。
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(categories).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("main").getByRole("navigation", { name: ja.admin_config }),
  ).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("tablecast-menu-sidebar.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: ja.admin_navigation, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: ja.editor_products, exact: true })
    .click();
  await expect(page).toHaveURL(/\/menu\/products$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("導入手順の個別URL・公開接続URL・スキル配布とOAuth一覧を日英で利用できる", async ({
  page,
}, testInfo) => {
  // Given: プラグイン導入ページ。
  await page.goto("/account/integrations/plugins");
  for (const [language, labels] of [
    ["日本語", ja],
    ["English", en],
  ] as const) {
    await page.getByRole("button", { name: language, exact: true }).click();
    await expect(page.getByText(labels.mcp_unpublished, { exact: true })).toBeVisible();
    await expect(page.getByRole("textbox", { name: labels.mcp_endpoint, exact: true })).toHaveValue(
      connection.mcpServers.tablecast.url,
    );
    // When: 手動導入へ移動し、スキルを保存する。
    await page.getByRole("link", { name: labels.mcp_manual_install, exact: true }).click();
    await expect(page).toHaveURL(/\/account\/integrations\/manual$/);
    const downloaded = page.waitForEvent("download");
    await page.getByRole("link", { name: labels.mcp_skill_download, exact: true }).click();
    expect((await downloaded).suggestedFilename()).toBe("SKILL.md");
    // Then: 対象環境と権限が表示され、OAuth一覧にも進める。
    expect(
      await page.getByRole("textbox", { name: "Codex CLI", exact: true }).inputValue(),
    ).toContain(connection.mcpServers.tablecast.url);
    await page.getByRole("link", { name: labels.mcp_oauth_sessions, exact: true }).click();
    await expect(page.getByRole("searchbox", { name: labels.mcp_session_search })).toBeVisible();
    await page.getByRole("link", { name: labels.mcp_plugin_install, exact: true }).click();
  }
  await page.screenshot({ path: testInfo.outputPath("tablecast-plugin-guide.png") });
});

test("店舗アイコンを変更し、再読込後の設定とサイドバーに同じ画像が表示される", async ({
  page,
}, testInfo) => {
  // Given: 画像付きのseedと管理者。
  await page.goto("/admin/stores/tablecast-komorebi/profile");
  await expect(page.getByRole("heading", { name: ja.store_profile, exact: true })).toBeVisible();
  const initial = page.getByRole("region", { name: ja.store_profile, exact: true }).locator("img");
  await expect(initial).toHaveAttribute("src", /\/api\/avatars\//);
  await expect
    .poll(() =>
      initial.evaluate(
        (element) =>
          element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  // When: 画像を選ぶと店舗アイコンを保存する。
  await page.getByLabel(ja.store_icon_change).setInputFiles({
    name: "tablecast-icon.png",
    mimeType: "image/png",
    buffer: await initial.screenshot(),
  });
  await expect(page.getByRole("status")).toContainText(ja.account_saved);
  const imageUrl = await initial.getAttribute("src");
  await page.reload();
  // Then: ページとサイドバーで保存画像を共有する。
  await expect(initial).toHaveAttribute("src", imageUrl ?? "");
  await expect
    .poll(() =>
      initial.evaluate(
        (element) =>
          element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await expect(page.locator(`aside img[src="${imageUrl}"]`)).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("tablecast-store-icon.png") });
});
