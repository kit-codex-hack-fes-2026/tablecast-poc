import { expect } from "@playwright/test";
import ja from "../messages/ja.json" with { type: "json" };
import { signInStaff } from "./support/session";
import { test } from "./support/test";

test.use({ trace: "off", serviceWorkers: "block" });

// Browser Modeのiframeリサイズとは異なる、実windowでのPanelの再登録と幅復元を確認する。
test("管理サイドバーは実windowをモバイル幅から戻しても保存幅を復元する", async ({
  page,
  baseURL,
}) => {
  await signInStaff(page.request, baseURL);
  await page.goto("/account");
  const handle = page.getByRole("separator", { name: ja.admin_resize_sidebar });
  const sidebar = page.locator("#tablecast-admin-sidebar");
  await expect(handle).toBeEnabled();
  const initial = (await sidebar.boundingBox())?.width ?? 0;
  await handle.focus();
  await handle.press("ArrowRight");
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(initial);
  const adjusted = (await sidebar.boundingBox())?.width ?? 0;
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(handle).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(handle).toBeEnabled();
  await expect
    .poll(async () => Math.abs(((await sidebar.boundingBox())?.width ?? 0) - adjusted))
    .toBeLessThan(2);
});
