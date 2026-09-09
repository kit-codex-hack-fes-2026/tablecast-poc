import { test } from "./support/test";
import { expect } from "@playwright/test";
import ja from "../messages/ja.json" with { type: "json" };
import { credentials } from "./support/runtime";

// 認証入力を含むため通信traceは保存しない。
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

test("サイドバーの調整幅を保存し、折りたたみと狭い画面のナビゲーションを維持する", async ({
  page,
}, testInfo) => {
  // Given: 通常幅の管理画面。
  await page.goto("/account");
  const handle = page.getByRole("separator", { name: ja.admin_resize_sidebar });
  const sidebar = page.locator("#tablecast-admin-sidebar");
  await expect(handle).toBeVisible();
  const initial = await sidebar.boundingBox();
  const grip = await handle.boundingBox();
  if (!initial || !grip) throw new Error("サイドバーの領域を取得できません。");
  expect(initial.height).toBeLessThanOrEqual(768);
  await expect(handle.locator("svg")).toBeInViewport();
  // When: ドラッグと矢印キーで広げ、再読み込みする。
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + 60, grip.y + grip.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => (await sidebar.boundingBox())?.width ?? 0)
    .toBeGreaterThan(initial.width + 40);
  await handle.focus();
  const dragged = (await sidebar.boundingBox())?.width ?? 0;
  await handle.press("ArrowRight");
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(dragged);
  const adjusted = (await sidebar.boundingBox())?.width ?? 0;
  await page.reload();
  // Then: 保存幅と折りたたみ前の幅が復元される。
  await expect
    .poll(async () => Math.abs(((await sidebar.boundingBox())?.width ?? 0) - adjusted))
    .toBeLessThan(2);
  const toggle = page.getByRole("button", { name: ja.admin_navigation, exact: true });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 999).toBeLessThan(80);
  await page.screenshot({ path: testInfo.outputPath("tablecast-admin-collapsed.png") });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect
    .poll(async () => Math.abs(((await sidebar.boundingBox())?.width ?? 0) - adjusted))
    .toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath("tablecast-admin-resized.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(handle).toHaveCount(0);
  await toggle.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: ja.common_close, exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect
    .poll(async () => Math.abs(((await sidebar.boundingBox())?.width ?? 0) - adjusted))
    .toBeLessThan(2);
});

test("注文ペインを調整しても選択タブと音声操作を維持し、再読込で比率を復元する", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  // Given: 隔離DBの利用中の卓へ接続した端末。
  const context = await browser.newContext({ baseURL, viewport: { width: 1024, height: 768 } });
  const guest = await context.newPage();
  try {
    await guest.goto("/");
    await guest.getByRole("button", { name: ja.pair_begin, exact: true }).click();
    const code = await guest.getByRole("status", { name: ja.admin_pair_code }).innerText();
    expect(
      (
        await page.request.post("/api/admin/stores/tablecast-komorebi/devices/approve", {
          headers: { Origin: baseURL ?? "" },
          data: { userCode: code, tableId: "tablecast-komorebi-table-01" },
        })
      ).ok(),
    ).toBe(true);
    const handle = guest.getByRole("separator", { name: ja.kiosk_resize_panes });
    await expect(handle).toBeVisible();
    const panel = guest.locator("#tablecast-order");
    const basket = guest.getByRole("tab", { name: /^注文かご/ });
    await basket.click();
    const initial = (await panel.boundingBox())?.width ?? 0;
    // When: 幅を変更し、縦並びへ切り替えて高さも変更する。
    await handle.focus();
    await handle.press("ArrowLeft");
    await expect
      .poll(async () => (await panel.boundingBox())?.width ?? 0)
      .toBeGreaterThan(initial + 10);
    await expect(basket).toHaveAttribute("aria-selected", "true");
    await guest.setViewportSize({ width: 390, height: 844 });
    await expect(handle).toHaveAttribute("aria-orientation", "horizontal");
    const height = (await panel.boundingBox())?.height ?? 0;
    await handle.focus();
    await handle.press("ArrowUp");
    await expect
      .poll(async () => (await panel.boundingBox())?.height ?? 0)
      .toBeGreaterThan(height + 10);
    // Then: ページ操作と音声停止状態が保持され、再読み込みでも表示比率を再現する。
    await expect(basket).toHaveAttribute("aria-selected", "true");
    await expect(
      guest.getByRole("button", { name: ja.kiosk_voice_resume, exact: true }),
    ).toBeVisible();
    await guest.screenshot({ path: testInfo.outputPath("tablecast-order-resized-mobile.png") });
    await guest.setViewportSize({ width: 1024, height: 768 });
    await expect(handle).toHaveAttribute("aria-orientation", "vertical");
    const adjusted = (await panel.boundingBox())?.width ?? 0;
    await guest.reload();
    await expect
      .poll(async () => Math.abs(((await panel.boundingBox())?.width ?? 0) - adjusted))
      .toBeLessThan(2);
    await guest.screenshot({ path: testInfo.outputPath("tablecast-order-resized.png") });
  } finally {
    await context.close();
  }
});
